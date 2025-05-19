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

    // NOVA PARTE: Criação de permissões, grupos e planos
    console.log('Verificando e criando permissões, grupos de permissões e planos...');

    // 1. Verificar e criar permissões básicas
    const permissionsData = [
        { description: "Job Schedule" },
        { description: "Job Dispatch" },
        { description: "Projects" },
        { description: "Activities" },
        { description: "Estimates" },
        { description: "Invoice" },
        { description: "Time Cards" },
        { description: "Catalog" },
        { description: "Services" },
        { description: "User Management" },
        { description: "Settings" },
    ];

    // Verificar permissões existentes
    const existingPermissions = await prisma.permissions.findMany();
    const existingDescriptions = existingPermissions.map(p => p.description);
    
    // Criar apenas permissões que não existem
    const permissionsToCreate = permissionsData.filter(
        p => !existingDescriptions.includes(p.description)
    );
    
    let createdPermissions = [...existingPermissions];
    
    if (permissionsToCreate.length > 0) {
        const newPermissions = await Promise.all(
            permissionsToCreate.map(permission => 
                prisma.permissions.create({ data: permission })
            )
        );
        
        createdPermissions = [...existingPermissions, ...newPermissions];
        console.log(`${newPermissions.length} novas permissões criadas`);
    } else {
        console.log('Todas as permissões já existem no banco');
    }
    
    // 2. Verificar e criar grupos de permissões
    // Verificar grupos existentes
    let trialGroup = await prisma.permissionGroup.findFirst({
        where: { description: "Group Trial" }
    });
    
    // let basicGroup = await prisma.permissionGroup.findFirst({
    //     where: { description: "Group Basic" }
    // });
    
    // let proGroup = await prisma.permissionGroup.findFirst({
    //     where: { description: "Group Pro" }
    // });
    
    // Criar grupos que não existem
    if (!trialGroup) {
        trialGroup = await prisma.permissionGroup.create({
            data: { description: "Group Trial" }
        });
        console.log('Grupo Trial criado');
    }
    
    // if (!basicGroup) {
    //     basicGroup = await prisma.permissionGroup.create({
    //         data: { description: "Group Basic" }
    //     });
    //     console.log('Grupo Basic criado');
    // }
    
    // if (!proGroup) {
    //     proGroup = await prisma.permissionGroup.create({
    //         data: { description: "Group Pro" }
    //     });
    //     console.log('Grupo Pro criado');
    // }
    
    // 3. Verificar e associar permissões aos grupos
    // Verificar permissões já associadas
    const trialPermissions = await prisma.groupPermissionsList.findMany({
        where: { permission_group: trialGroup.id }
    });
    
    // const basicPermissions = await prisma.groupPermissionsList.findMany({
    //     where: { permission_group: basicGroup.id }
    // });
    
    // const proPermissions = await prisma.groupPermissionsList.findMany({
    //     where: { permission_group: proGroup.id }
    // });
    
    // Associar permissões ao grupo Trial (todas as permissões, como o Pro)
    const trialPermissionsIds = trialPermissions.map(p => p.permission_id);
    const trialPermissionsToAdd = createdPermissions
        .filter(p => !trialPermissionsIds.includes(p.id));
    
    if (trialPermissionsToAdd.length > 0) {
        await Promise.all(
            trialPermissionsToAdd.map(permission =>
                prisma.groupPermissionsList.create({
                    data: {
                        permission_id: permission.id,
                        permission_group: trialGroup.id
                    }
                })
            )
        );
        console.log(`${trialPermissionsToAdd.length} permissões adicionadas ao grupo Trial`);
    }
    
    // Associar permissões ao grupo Basic (primeiras 6)
    // const basicPermissionsIds = basicPermissions.map(p => p.permission_id);
    // const basicPermissionsToAdd = createdPermissions
    //     .slice(0, 6)
    //     .filter(p => !basicPermissionsIds.includes(p.id));
    
    // if (basicPermissionsToAdd.length > 0) {
    //     await Promise.all(
    //         basicPermissionsToAdd.map(permission =>
    //             prisma.groupPermissionsList.create({
    //                 data: {
    //                     permission_id: permission.id,
    //                     permission_group: basicGroup.id
    //                 }
    //             })
    //         )
    //     );
    //     console.log(`${basicPermissionsToAdd.length} permissões adicionadas ao grupo Basic`);
    // }
    
    // // Associar permissões ao grupo Pro (todas)
    // const proPermissionsIds = proPermissions.map(p => p.permission_id);
    // const proPermissionsToAdd = createdPermissions
    //     .filter(p => !proPermissionsIds.includes(p.id));
    
    // if (proPermissionsToAdd.length > 0) {
    //     await Promise.all(
    //         proPermissionsToAdd.map(permission =>
    //             prisma.groupPermissionsList.create({
    //                 data: {
    //                     permission_id: permission.id,
    //                     permission_group: proGroup.id
    //                 }
    //             })
    //         )
    //     );
    //     console.log(`${proPermissionsToAdd.length} permissões adicionadas ao grupo Pro`);
    // }
    
    // 4. Verificar e criar planos
    // Verificar planos existentes
    let trialPlan = await prisma.plan.findFirst({
        where: { name: "Trial" }
    });
    
    // let basicPlan = await prisma.plan.findFirst({
    //     where: { name: "Basic" }
    // });
    
    // let proPlan = await prisma.plan.findFirst({
    //     where: { name: "Pro" }
    // });
    
    // Criar planos que não existem
    if (!trialPlan) {
        trialPlan = await prisma.plan.create({
            data: {
                name: "Trial",
                description: "Free 15-day trial plan",
                validityType: "DAYS",
                validityDuration: 15,
                permissionGroupId: trialGroup.id
            }
        });
        console.log('Plano Trial criado');
    }
    
    // if (!basicPlan) {
    //     basicPlan = await prisma.plan.create({
    //         data: {
    //             name: "Basic",
    //             description: "Basic features for small businesses",
    //             price: 29.99,
    //             features: JSON.stringify(['Feature 1', 'Feature 2', 'Feature 3']),
    //             validityType: "MONTHLY",
    //             validityDuration: 30,
    //             permissionGroupId: basicGroup.id
    //         }
    //     });
    //     console.log('Plano Basic criado');
    // }
    
    // if (!proPlan) {
    //     proPlan = await prisma.plan.create({
    //         data: {
    //             name: "Pro",
    //             description: "Professional plan with all features",
    //             validityType: "MONTHLY",
    //             validityDuration: 1,
    //             permissionGroupId: proGroup.id
    //         }
    //     });
    //     console.log('Plano Pro criado');
    // }
    
    console.log('IDs dos planos:');
    console.log({
        trial: trialPlan.id,
        // basic: basicPlan.id,
        // pro: proPlan.id
    });

    console.log('Seed concluído com sucesso!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });