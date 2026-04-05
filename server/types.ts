import { type User } from "./storage.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}
