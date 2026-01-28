import { IOffice } from "./IOffice";

export interface IUser {
  id: string;
  avatar?: string;
  name: string;
  email: string;
  document: string;
  phone?: string;
  city_and_state?: string;
  password: string;
  rules: JSON;
  token_recover_password?: string;
  autorId?: string;
  last_acess?: Date;
  date_creation: Date;
  date_update: Date;
  office: IOffice;
  office_id: string;
}

export interface INewUser {
  avatar?: string;
  name: string;
  email: string;
  document: string;
  phone?: string;
  city_and_state?: string;
  rules?: JSON;
  //office: IOffice;
  office_id: string;
  //apenas pate corrigir email
  password?: string // Opcional - se não fornecida, será gerada automaticamente
  hourly_price?: number
  profession?: string
  company_id: string
  attendanceMode?: string
  clockOutMode?: string
  canEditTimeCard?: boolean | string
  dailyRate?: number | string
  defaultBreakMinutes?: number | string
}


export interface INewCompany {
  company_name: string
  avatar?: string;
  name: string;
  email: string;
  document?: string;
  phone?: string;
  city_and_state?: string;
  rules?: JSON;
  office_id: string;
  password: string | string[]
  profession?: string
  extraEmployees?: string | number;
}