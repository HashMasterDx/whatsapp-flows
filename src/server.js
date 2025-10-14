/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import express from "express";
import {decryptRequest, encryptResponse, FlowEndpointException, generateHmacSignature} from "./encryption.js";
import { getNextScreen } from "./flow.js";
import crypto from "crypto";
import axios from "axios";

const app = express();

app.use(
  express.json({
    // store the raw request body to use it for signature verification
    verify: (req, res, buf, encoding) => {
      req.rawBody = buf?.toString(encoding || "utf8");
    },
  }),
);

const { APP_SECRET, PRIVATE_KEY, PASSPHRASE = "", PORT = "3000", API_URL, NODE_HMAC_SECRET } = process.env;


/*
Example:
```-----[REPLACE THIS] BEGIN RSA PRIVATE KEY-----
MIIE...
...
...AQAB
-----[REPLACE THIS] END RSA PRIVATE KEY-----```
*/

app.post("/", async (req, res) => {
  if (!PRIVATE_KEY) {
    throw new Error(
      'Private key is empty. Please check your env variable "PRIVATE_KEY".'
    );
  }

  if(!isRequestSignatureValid(req)) {
    // Return status code 432 if request signature does not match.
    // To learn more about return error codes visit: https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes
    return res.status(432).send();
  }

  let decryptedRequest = null;

  try {
    decryptedRequest = decryptRequest(req.body, PRIVATE_KEY, PASSPHRASE);
  } catch (err) {
    console.error(err);
    if (err instanceof FlowEndpointException) {
      return res.status(err.statusCode).send();
    }
    return res.status(500).send();
  }

  const { aesKeyBuffer, initialVectorBuffer, decryptedBody } = decryptedRequest;
  console.log("💬 Decrypted Request:", decryptedBody);

  // TODO: Uncomment this block and add your flow token validation logic.
  // If the flow token becomes invalid, return HTTP code 427 to disable the flow and show the message in `error_msg` to the user
  // Refer to the docs for details https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes

  /*
  if (!isValidFlowToken(decryptedBody.flow_token)) {
    const error_response = {
      error_msg: `The message is no longer available`,
    };
    return res
      .status(427)
      .send(
        encryptResponse(error_response, aesKeyBuffer, initialVectorBuffer)
      );
  }
  */

  const screenResponse = await getNextScreen(decryptedBody);
  console.log("👉 Response to Encrypt:", screenResponse);

  res.send(encryptResponse(screenResponse, aesKeyBuffer, initialVectorBuffer));
});

app.post("/trans" , async (req, res) => {
  // Suponiendo que 'req.rawBody' contiene el string JSON que recibes.
  const rawBodyString = req.rawBody;

  try {
    // 1. Convertir el string JSON a un objeto JavaScript.
    const data = JSON.parse(rawBodyString);

    // 2. Validar si el 'type' es "charge.succeeded".
    if (data.type === "charge.succeeded") {

      // 3. Si es válido, obtener el ID de la transacción.
      const transactionId = data.transaction.id;

      const signature = generateHmacSignature({ id: transactionId }, NODE_HMAC_SECRET);

      const response = await axios.post(API_URL + '/liquidar-transaccion', {
        id: transactionId
      }, {headers: {
        "Content-Type": "application/json",
          "X-Signature": signature,
      }});

      res.status(200).send({ status: "transaction_processed", data: response.data });
    } else if (data.type === "verification") {
      console.log("La petición contiene:", data);
      res.status(200).send({ status: "received" });
    } else {
      console.log("Tipo de evento no manejado:", data.type);
      res.status(200).send({ status: "event_not_handled" });
    }

  } catch (error) {
    console.error("Error al procesar el JSON:", error);
    res.status(400).send({ error: "Invalid JSON format" });
    // Manejar el caso en que el rawBody no sea un JSON válido.
  }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});

function isRequestSignatureValid(req) {
  if(!APP_SECRET) {
    console.warn("App Secret is not set up. Please Add your app secret in /.env file to check for request validation");
    return true;
  }

  const signatureHeader = req.get("x-hub-signature-256");
  const signatureBuffer = Buffer.from(signatureHeader.replace("sha256=", ""), "utf-8");

  const hmac = crypto.createHmac("sha256", APP_SECRET);
  const digestString = hmac.update(req.rawBody).digest('hex');
  const digestBuffer = Buffer.from(digestString, "utf-8");

  if ( !crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    console.error("Error: Request Signature did not match");
    return false;
  }
  return true;
}
