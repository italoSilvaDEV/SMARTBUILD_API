import { Request } from 'express';
import { decodeToken } from './decodeToken';

function returnPayLoad(request: Request) {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]
    const secret = process.env.SECRET_JWT;
    if (!token) {
        return null;
    }
    const decoded = decodeToken(token, String(secret));
    if(!decoded){
        return null;
    }
    return decoded
}

export { returnPayLoad };
