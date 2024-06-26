import { Request, Response, NextFunction } from "express";
import Jwt from 'jsonwebtoken'

export function checkToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  if (!authHeader) {
    throw Error("Token not informed")
  }
  const token = authHeader && authHeader.split(" ")[1]
  const secret = process.env.SECRET_JWT
  Jwt.verify(token, String(secret), function (err, decoded) {
    if (err) {
      throw Error("Failed to authenticate token")
    }

    next();
  });
}
