import { IUser } from "./IUser";

export interface IOffice {
    id: string;
    name: string;
    date_creation: Date;
    date_update: Date;
    User: IUser[];
}
