import mysql from 'mysql2/promise';

interface Client {
  id: string;
  email: string;
  name: string;
  location: string | null;
  lat: string | null;
  log: string | null;
  date_creation: Date;
  company_id: string | null;
  project_count: number;
}

interface Ocorrencie {
  name: string;
  company_id: string;
  ocorrencias: number;
  clients: Client[];
  selectedClient?: Client;
}

class Mysql {
  private config = {
    host: 'localhost',
    port: 3306,
    user: 'admin',
    password: '123456',
    database: 'backup0308',
  };

  private async getConnection() {
    return mysql.createConnection(this.config);
  }

  public async transferLocationToProjects() {
    const conn = await this.getConnection();
    try {
      // Transferir lat, log e location de todos os clientes para seus projetos
      await conn.execute(
        `UPDATE \`${this.config.database}\`.project p
         JOIN \`${this.config.database}\`.Client c ON p.client_id = c.id
         SET 
            p.location = c.location, 
            p.lat = c.lat, 
            p.log = c.log,
            p.radius = c.radius
         WHERE 
            c.location IS NOT NULL 
            OR c.lat IS NOT NULL 
            OR c.log IS NOT NULL
            OR c.radius IS NOT NULL`
      );
      console.log('OK TRANSFER LOCATION TO PROJECTS');
    } finally {
      await conn.end();
    }
  }

  public async getOcorrencies(): Promise<Ocorrencie[]> {
    const conn = await this.getConnection();
    try {
      // 1) Agrupar clientes por name e company_id para identificar duplicatas dentro da mesma empresa
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT c.name, c.company_id, COUNT(*) AS ocorrencias
         FROM \`${this.config.database}\`.Client c
         WHERE c.company_id IS NOT NULL
         GROUP BY c.name, c.company_id
         HAVING ocorrencias > 1
         ORDER BY c.company_id, c.name`
      );

      const ocorr: Ocorrencie[] = (rows as any[]).map((r) => ({
        name: r.name,
        company_id: r.company_id,
        ocorrencias: r.ocorrencias,
        clients: [],
      }));

      // 2) Para cada grupo de duplicatas, buscar detalhes dos clientes e contar projetos
      for (const o of ocorr) {
        const [clientsRows] = await conn.execute<mysql.RowDataPacket[]>(
          `SELECT 
             c.id, 
             c.email, 
             c.name, 
             c.date_creation, 
             c.location, 
             c.lat, 
             c.log, 
             c.company_id,
             (SELECT COUNT(*) 
              FROM \`${this.config.database}\`.project p 
              WHERE p.client_id = c.id) AS project_count
           FROM \`${this.config.database}\`.Client c
           WHERE c.name = ? AND c.company_id = ?
           ORDER BY project_count DESC, c.date_creation DESC`,
          [o.name, o.company_id]
        );

        o.clients = (clientsRows as any[]).map((r) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          date_creation: r.date_creation,
          location: r.location,
          lat: r.lat,
          log: r.log,
          company_id: r.company_id,
          project_count: r.project_count,
        }));

        // 3) Selecionar o cliente com mais projetos ou mais recente
        if (o.clients.length > 0) {
          o.selectedClient = o.clients[0]; // Primeiro cliente (mais projetos ou mais recente)
        }
      }

      return ocorr;
    } finally {
      await conn.end();
    }
  }

  public async fixDuplicationClients(occs: Ocorrencie[]) {
    const conn = await this.getConnection();
    try {
      await conn.beginTransaction();

      // 1) Atualizar projetos para apontar para o selectedClient dentro da mesma empresa
      for (const o of occs) {
        const sel = o.selectedClient!;
        for (const c of o.clients) {
          if (c.id === sel.id) continue;

          // Transferir projetos do cliente duplicado para o selecionado
          await conn.execute(
            `UPDATE \`${this.config.database}\`.project p
             SET client_id = ?
             WHERE client_id = ?`,
            [sel.id, c.id]
          );
        }
      }
      console.log('OK UPDATE PROJECTS');

      // 2) Remover clientes duplicados dentro da mesma empresa
      for (const o of occs) {
        const sel = o.selectedClient!;
        for (const c of o.clients) {
          if (c.id === sel.id) continue;

          // Apagar o cliente duplicado
          await conn.execute(
            `DELETE FROM \`${this.config.database}\`.Client WHERE id = ?`,
            [c.id]
          );
        }
      }
      console.log('OK REMOVE DUPLICATED CLIENTS');

      // 3) Ajustar emails duplicados dentro da mesma empresa
      const [dups] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT c.email, c.company_id, COUNT(*) AS ocorrencias
         FROM \`${this.config.database}\`.Client c
         WHERE c.company_id IS NOT NULL
         GROUP BY c.email, c.company_id
         HAVING ocorrencias > 1`
      );

      for (const row of dups as any[]) {
        const email = row.email as string;
        const company_id = row.company_id as string;

        const [ids] = await conn.execute<mysql.RowDataPacket[]>(
          `SELECT id, date_creation 
           FROM \`${this.config.database}\`.Client 
           WHERE email = ? AND company_id = ?
           ORDER BY date_creation DESC`,
          [email, company_id]
        );

        // Manter o cliente mais recente, ajustar emails dos outros
        (ids as any[]).forEach((r, idx) => {
          if (idx === 0) return; // Pular o primeiro (mais recente)
          const at = email.lastIndexOf('@');
          const novo = `${email.slice(0, at)}_${idx}${email.slice(at)}`;
          conn.execute(
            `UPDATE \`${this.config.database}\`.Client 
             SET email = ? 
             WHERE id = ?`,
            [novo, r.id]
          );
        });
      }
      console.log('OK CHANGE DUPLICATED EMAILS');

      await conn.commit();
    } catch (e) {
      console.error(e);
      console.log('ROLLBACKING...');
      await conn.rollback();
      throw e;
    } finally {
      await conn.end();
    }
  }

  public async removeClientsWithoutProject() {
    const conn = await this.getConnection();
    try {
      await conn.execute(
        `DELETE FROM \`${this.config.database}\`.Client
         WHERE id NOT IN (SELECT client_id FROM \`${this.config.database}\`.project)`
      );
      console.log('OK REMOVE CLIENTS WITHOUT PROJECT');
    } finally {
      await conn.end();
    }
  }
}

async function main() {
  const db = new Mysql();

  // 1) Transferir lat, log e location para a tabela project
  await db.transferLocationToProjects();

  // 2) Consolidar duplicatas e ajustar emails
  const occs = await db.getOcorrencies();
  await db.fixDuplicationClients(occs);

  // 3) Remover clientes sem projetos
  await db.removeClientsWithoutProject();

  console.log('fixClientData2 concluído com sucesso!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});