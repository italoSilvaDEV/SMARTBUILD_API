import bcrypt from "bcrypt";
import { prisma } from "../src/utils/prisma";
async function main() {
    await prisma.user.deleteMany({ where: { email: { equals: "master@user.com" } } })

    const senha = 'CodelabsMaster';
    const hashedPassword = bcrypt.hashSync(senha, 10);

    const offices = await prisma.office.findMany({})
    const dataOffice = ['Master', 'Administrator', 'Seller', 'Worker']
    const officeDataBase = offices.map(i => i.name)
    dataOffice.map(async i => !officeDataBase.includes(i) && await prisma.office.create({ data: { name: i } }))

    const officeMaster = await prisma.office.findFirst({
        where: {
            name: {
                equals: 'Master'
            }
        }
    })

    await prisma.user.create({
        data: {
            avatar: '',
            name: "User master",
            email: "master@user.com",
            password: hashedPassword,
            document: '',
            phone: '',
            city_and_state: '',
            rules: {},
            office_id: String(officeMaster?.id),
        },
    });
    console.log({
        login: "master@user.com",
        password: senha
    })
    // Primeiro, buscamos todos os projetos sem número de contrato, ordenados por data de criação
    const projects = await prisma.project.findMany({
        where: {
            contract_number: null,  // Garantir que só vamos modificar projetos sem número de contrato
        },
        orderBy: {
            date_creation: 'asc',  // Ordenar por data de criação crescente
        },
    });

    // Definir o tipo de groupedByCompany
    const groupedByCompany: { [key: string]: typeof projects } = {};  // Especifica que as chaves serão strings

    // Agrupar os projetos por company_id, tratando null separadamente
    for (const project of projects) {
        const companyId = project.company_id || 'no_company';  // Se company_id for null, usamos 'no_company' como chave
        if (!groupedByCompany[companyId]) {
            groupedByCompany[companyId] = [];
        }
        groupedByCompany[companyId].push(project);
    }

    // Agora, vamos gerar os números de contrato para cada empresa
    for (const companyId in groupedByCompany) {
        let contractNumber = 1000;  // Iniciar a numeração a partir de 1000
        const companyProjects = groupedByCompany[companyId];

        for (const project of companyProjects) {
            // Atribuir o número de contrato ao projeto
            await prisma.project.update({
                where: { id: project.id },
                data: { contract_number: contractNumber },
            });

            // Incrementar o número do contrato para o próximo projeto
            contractNumber++;
        }
    }

    console.log('Números de contrato atribuídos com sucesso!');


}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });