import mysql from "mysql2/promise";

import {
  config,
} from "./config.js";

export function createDb() {
  return mysql.createConnection({
    host:
      config.mysql.host,

    port:
      config.mysql.port,

    database:
      config.mysql.database,

    user:
      config.mysql.user,

    password:
      config.mysql.password,

    multipleStatements:
      true,

    charset:
      "utf8mb4",
  });
}
