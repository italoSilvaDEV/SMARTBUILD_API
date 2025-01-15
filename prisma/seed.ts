import bcrypt from "bcrypt";
import crypto from "crypto"
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
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });