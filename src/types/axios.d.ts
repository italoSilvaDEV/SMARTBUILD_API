import 'axios';

declare module 'axios' {
  // Este é o tipo que os interceptors recebem
  export interface InternalAxiosRequestConfig<D = any> {
    __didRefresh?: boolean;
    __retryCount?: number;
  }
}