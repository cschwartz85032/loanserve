import { loadConfig } from "../bootstrap/config";
import { RabbitService } from "./rabbit";
export const cfg = loadConfig();
export const rabbit = new RabbitService(cfg);