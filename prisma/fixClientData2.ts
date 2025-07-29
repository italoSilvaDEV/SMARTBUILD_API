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
}

interface Ocorrencie {
  email: string;
  name: string;
  ocorrencias: number;
  clients: Client[];
  selectedClient?: Client;
}

class Mysql {
  private config = {
    host: "localhost",
    port: 3306,
    user: "admin",
    password: "123456",
    database: "backup25jul2",
  };

  private async getConnection() {
    return mysql.createConnection(this.config);
  }

  public async getOcorrencies(): Promise<Ocorrencie[]> {
    const conn = await this.getConnection();
    try {
      const [rows] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT c.email, c.name, COUNT(*) AS ocorrencias
           FROM \`${this.config.database}\`.Client c
          GROUP BY c.email, c.name
          ORDER BY ocorrencias DESC`
      );

      const ocorr: Ocorrencie[] = (rows as any[]).map(r => ({
        email: r.email,
        name: r.name,
        ocorrencias: r.ocorrencias,
        clients: [],
      }));

      for (const o of ocorr) {
        const [clientsRows] = await conn.execute<mysql.RowDataPacket[]>(
          `SELECT c.id, c.date_creation, c.location, c.lat, c.log, c.company_id
             FROM \`${this.config.database}\`.Client c
            WHERE c.email = ? AND c.name = ?`,
          [o.email, o.name]
        );

        o.clients = (clientsRows as any[]).map(r => ({
          id: r.id,
          email: o.email,
          name: o.name,
          date_creation: r.date_creation,
          location: r.location,
          lat: r.lat,
          log: r.log,
          company_id: r.company_id,
        }));

        if (o.clients.length > 0) {
          o.selectedClient = o.clients[0];
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

      // 1) Atualiza projetos para apontar pro selectedClient
      for (const o of occs) {
        const sel = o.selectedClient!;
        for (const c of o.clients) {
          await conn.execute(
            `UPDATE \`${this.config.database}\`.project p
                SET client_id = ?, location = ?, lat = ?, log = ?
              WHERE client_id = ?`,
            [sel.id, c.location, c.lat, c.log, c.id]
          );
        }
      }
      console.log('OK UPDATE PROJECTS');

      // 2) Remove duplicados e carrega CompanyClient
    //   for (const o of occs) {
    //     const sel = o.selectedClient!;
    //     // garante inserção inicial
    //     if (sel.company_id) {
    //       await conn.execute(
    //         `INSERT IGNORE INTO \`${this.config.database}\`.CompanyClient
    //            (clientId, companyId) VALUES (?, ?)`,
    //         [sel.id, sel.company_id]
    //       );
    //     }

    //     for (const c of o.clients) {
    //       if (c.id === sel.id) continue;
    //       // insere vínculo com empresa para o selecionado
    //       if (c.company_id) {
    //         await conn.execute(
    //           `INSERT IGNORE INTO \`${this.config.database}\`.CompanyClient
    //              (clientId, companyId) VALUES (?, ?)`,
    //           [sel.id, c.company_id]
    //         );
    //       }
    //       // deleta cliente duplicado
    //       await conn.execute(
    //         `DELETE FROM \`${this.config.database}\`.Client WHERE id = ?`,
    //         [c.id]
    //       );
    //     }
    //   }
    //   console.log('OK REMOVE DUPLICATED CLIENTS');

          // 2) Remove duplicados e carrega CompanyClient
          for (const o of occs) {
            const sel = o.selectedClient!;
            // 2.1) cria vínculo inicial (igual ao Python __create_client_company_initial)
            if (sel.company_id) {
              await conn.execute(
                `INSERT INTO \`${this.config.database}\`.CompanyClient (clientId, companyId)
                 SELECT ?, ? 
                 WHERE NOT EXISTS (
                   SELECT 1 FROM \`${this.config.database}\`.CompanyClient
                    WHERE clientId = ? AND companyId = ?
                 )`,
                [sel.id, sel.company_id, sel.id, sel.company_id]
              );
            }
    
            for (const c of o.clients) {
              if (c.id === sel.id) continue;
    
              if (c.company_id) {
                // 2.2) cria vínculo condicionalmente (igual ao Python __create_client_company)
                await conn.execute(
                  `INSERT INTO \`${this.config.database}\`.CompanyClient (clientId, companyId)
                   SELECT ?, ? 
                   WHERE NOT EXISTS (
                     SELECT 1 FROM \`${this.config.database}\`.CompanyClient
                      WHERE clientId = ? AND companyId = ?
                   )`,
                  [sel.id, c.company_id, sel.id, c.company_id]
                );
              }
    
              // 2.3) apaga o cliente duplicado
              await conn.execute(
                `DELETE FROM \`${this.config.database}\`.Client WHERE id = ?`,
                [c.id]
              );
            }
          }
          console.log('OK REMOVE DUPLICATED CLIENTS');
    

      // 3) Ajusta e‑mails duplicados
      const [dups] = await conn.execute<mysql.RowDataPacket[]>(
        `SELECT c.email, COUNT(*) AS ocorrencias
           FROM \`${this.config.database}\`.Client c
          GROUP BY c.email
         HAVING ocorrencias > 1`
      );
      for (const row of dups as any[]) {
        const email = row.email as string;
        const [ids] = await conn.execute<mysql.RowDataPacket[]>(
          `SELECT id FROM \`${this.config.database}\`.Client WHERE email = ?`,
          [email]
        );
        (ids as any[]).forEach((r, idx) => {
          if (idx === 0) return;
          const at = email.lastIndexOf('@');
          const novo = `${email.slice(0, at)}_${idx}${email.slice(at)}`;
          conn.execute(
            `UPDATE \`${this.config.database}\`.Client SET email = ? WHERE id = ?`,
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

  const occs = await db.getOcorrencies();
  await db.fixDuplicationClients(occs);
  await db.removeClientsWithoutProject();

  console.log('fixClientData2 concluído com sucesso!');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
