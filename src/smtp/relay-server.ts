import { SMTPServer } from "smtp-server";
import fs from "node:fs";
import { authenticateSmtp, type SmtpAuthResult } from "./auth-handler.js";
import { handleIncomingMessage } from "./message-handler.js";
import { getConfig } from "../config/index.js";

interface SmtpSession {
  auth?: SmtpAuthResult;
}

export function createRelayServer(): SMTPServer {
  const config = getConfig();

  const tlsOptions: Record<string, any> = {};
  if (config.SMTP_TLS_KEY && config.SMTP_TLS_CERT) {
    try {
      tlsOptions.key = fs.readFileSync(config.SMTP_TLS_KEY);
      tlsOptions.cert = fs.readFileSync(config.SMTP_TLS_CERT);
    } catch {
      console.warn("TLS certs not found, running SMTP without TLS");
    }
  }

  const server = new SMTPServer({
    ...tlsOptions,
    secure: false, // STARTTLS, not implicit TLS
    authMethods: ["PLAIN", "LOGIN"],
    authOptional: false,
    disabledCommands: config.NODE_ENV === "development" ? ["STARTTLS"] : [],

    onAuth(auth, session, callback) {
      authenticateSmtp(auth.username || "", auth.password ?? "")
        .then((result) => {
          if (result) {
            (session as any).authResult = result;
            callback(null, { user: result.accountId });
          } else {
            callback(new Error("Authentication failed"));
          }
        })
        .catch((err) => callback(err));
    },

    onData(stream, session, callback) {
      const authResult = (session as any).authResult as SmtpAuthResult | undefined;
      if (!authResult) {
        callback(new Error("Not authenticated"));
        return;
      }

      handleIncomingMessage(stream, { accountId: authResult.accountId, companyId: authResult.companyId })
        .then((result) => {
          if (result.accepted) {
            callback();
          } else {
            callback(new Error(result.error || "Message rejected"));
          }
        })
        .catch((err) => callback(err));
    },

    onConnect(session, callback) {
      callback(); // Accept all connections
    },

    onMailFrom(address, session, callback) {
      callback(); // Accept all senders (validated in onData)
    },

    onRcptTo(address, session, callback) {
      callback(); // Accept all recipients (validated in onData)
    },
  });

  return server;
}
