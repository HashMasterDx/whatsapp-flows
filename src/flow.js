/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// this object is generated from Flow Builder under "..." > Endpoint > Snippets > Responses
// To navigate to a screen, return the corresponding response from the endpoint. Make sure the response is enccrypted.
import {generateHmacSignature} from './encryption.js';

import axios from 'axios';
import crypto from 'crypto';


const LARAVEL_ENDPOINT = process.env.API_URL;
const NODE_HMAC_SECRET = process.env.NODE_HMAC_SECRET;

export async function solicitarLinkPago({contrato_id, tipo_pago, monto_saldo = 0}) {
  const payload = JSON.stringify({contrato_id, tipo_pago, monto_saldo});

  const signature = crypto
    .createHmac("sha256", NODE_HMAC_SECRET)
    .update(payload)
    .digest("hex");

  console.log('firma ' + signature)
  console.log('payload ' + payload)
  console.log(LARAVEL_ENDPOINT + '/generar-link-pago', payload)

  return await axios.post(LARAVEL_ENDPOINT + '/generar-link-pago', payload, {
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
    },
  });
}

export async function obtenerConceptosFactura({contrato_id}) {

  const params = new URLSearchParams({
    contrato_id: contrato_id
  });

  const signature = generateHmacSignature(params.toString(), NODE_HMAC_SECRET);

  const response = await axios.get(LARAVEL_ENDPOINT + '/consultar-conceptos-factura' + '?contrato_id=' + contrato_id, {
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
    },
  });

  return response.data;
}

const SCREEN_RESPONSES = {
  CONTRATO: {
    version: "3.0",
    screen: "CONTRATO",
    data: {},
  },
  CONCEPTOS: {
    version: "3.0",
    screen: "CONCEPTOS",
    data: {},
  },
  SALDO_A_FAVOR: {
    version: "3.0",
    screen: "SALDO_A_FAVOR",
    data: {},
  },
  LINK: {
    version: "3.0",
    screen: "LINK",
    data: {},
  },
  ERROR: {
    version: "3.0",
    screen: "ERROR",
    data: {},
  },
  END: {
    version: "3.0",
    screen: "END",
    data: {},
  },
  COMPLETE: {
    version: "3.0",
    screen: "COMPLETE",
    data: {},
  },
};

export const getNextScreen = async (decryptedBody) => {
  const {screen, data, version, action, flow_token} = decryptedBody;
  // handle health check request
  if (action === "ping") {
    return {
      version,
      data: {
        status: "active",
      },
    };
  }

  // handle error notification
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      version,
      data: {
        acknowledged: true,
      },
    };
  }

  // handle initial request when opening the flow and display LOAN screen
  if (action === "INIT") {
    console.log("Flow initiated with token:", flow_token, "and data:", data)
    return {
      ...SCREEN_RESPONSES.CONTRATO,
    };
  }

  if (action === "BACK") {
    if  (screen === "LINK") {
      return {
        ...SCREEN_RESPONSES.END,
        data: {
          ...SCREEN_RESPONSES.END.data,
          end_msg: 'Ya haz generado un link de pago. Por favor, completa el pago o regresa al inicio.',
        },
      };
    }else{
      return {
        ...SCREEN_RESPONSES.CONTRATO,
      };
    }
  }

  if (action === "data_exchange") {
    // handle the request based on the current screen
    switch (screen) {
      // handles when user interacts with LOAN screen
      case "CONTRATO":
        // Handles user clicking on Continue to navigate to next screen
        try {
          //const response = await solicitarLinkPago({ contrato_id: data.contrato_id });

          const responseConceptos = await obtenerConceptosFactura({contrato_id: data.contrato_id});
          // Asegúrate de que existe y es válido
          if (responseConceptos.success && responseConceptos.conceptos != null) {
            return {
              ...SCREEN_RESPONSES.CONCEPTOS,
              data: {
                ...SCREEN_RESPONSES.CONCEPTOS.data,
                // RichText soporta tablas markdown (pipes), pero las filas deben ir
                // en un solo string/elemento sin línea en blanco entre ellas: si se
                // manda como arreglo de strings, cada elemento se renderiza como
                // párrafo aparte y la tabla se rompe. Cada elemento del arreglo sí
                // es su propio párrafo, así que dirección/tabla/total van separados
                // para que cada uno se vea como bloque independiente.
                conceptos: [
                  // "#" = TextHeading (negritas, texto grande) para validación visual del cliente.
                  `# ${responseConceptos.direccion}`,
                  [
                    '| Concepto | Monto |',
                    '| --- | --- |',
                    ...responseConceptos.conceptos.map(
                      (c) => `| ${c.descripcion} | ${c.monto} |`
                    ),
                  ].join('\n'),
                  // "##" = TextSubheading: más grande que el body, sin competir
                  // con el tamaño de la dirección (que usa "#").
                  `## ${responseConceptos.total}`,
                ],
              },
            };
          } else {
            return {
              ...SCREEN_RESPONSES.ERROR,
              data: {
                ...SCREEN_RESPONSES.ERROR.data,
                error_msg: 'No se pudieron obtener los conceptos de la factura. Por favor, inténtalo de nuevo más tarde.'
              },
            };
          }
        } catch (error) {
          console.error('Error al generar link de pago:', error.response.data.message);

          return {
            ...SCREEN_RESPONSES.ERROR,
            data: {
              ...SCREEN_RESPONSES.ERROR.data,
              error_msg: error.status === 404 ? 'El contrato no fue encontrado' : 'Ocurrió un error al generar el link de pago. Por favor, inténtalo de nuevo más tarde.'
            },
          };
        }
        // otherwise refresh quote based on user selection
        return {
          ...SCREEN_RESPONSES.CONTRATO,
          data: {
            contrato_id: data.contrato_id,
          },
        };

      case "ERROR":
        return {
          ...SCREEN_RESPONSES.CONTRATO,
        };

      case "CONCEPTOS":
        try {
          const responseConceptos = await obtenerConceptosFactura({contrato_id: data.contrato_id});

          let aplica_saldo_favor = responseConceptos.aplica_saldo_favor;
          let saldo_a_favor = responseConceptos.saldo_a_favor;
          let total_pendiente = responseConceptos.total;
          let max_aplicable = responseConceptos.max_aplicable_saldo_favor;

          console.log(responseConceptos)

          if (aplica_saldo_favor) {
            return {
              ...SCREEN_RESPONSES.SALDO_A_FAVOR,
              data: {
                ...SCREEN_RESPONSES.SALDO_A_FAVOR.data,
                saldo_a_favor: saldo_a_favor,
                total_pendiente: total_pendiente,
                max_aplicable: max_aplicable,
                init_values: {
                  monto_saldo: '0',
                },
                error_messages: {}
              },
            }
          }

          const response = await solicitarLinkPago({contrato_id: data.contrato_id, tipo_pago: data.tipo_pago});

          console.error('Response link pago:', response)
          // Asegúrate de que existe y es válido
          if (response.data.success && response.data.pago_url != null) {
            return {
              ...SCREEN_RESPONSES.LINK,
              data: {
                ...SCREEN_RESPONSES.LINK.data,
                link_pago: response.data.pago_url,
              },
            };
          } else {
            return {
              ...SCREEN_RESPONSES.ERROR,
              data: {
                ...SCREEN_RESPONSES.ERROR.data,
                error_msg: response.status === 500 ? 'No se pudo generar el link de pago. Por favor, inténtalo de nuevo más tarde.' : response.data.message
              },
            };
          }
        }catch (error) {
          console.error('Error al generar link de pago:', error);

          if (error.status === 500){
            return {
              ...SCREEN_RESPONSES.ERROR,
              data: {
                ...SCREEN_RESPONSES.ERROR.data,
                error_msg: 'Ocurrió un error al generar el link de pago. Por favor, inténtalo de nuevo más tarde.'
              },
            }
          } else {
            return {
              ...SCREEN_RESPONSES.END,
              data: {
                ...SCREEN_RESPONSES.END.data,
                end_msg: error.response.data.message
              },
            };
          }
        }


      case "LINK":
        
        return {
          ...SCREEN_RESPONSES.COMPLETE
        };

      case "SALDO_A_FAVOR":
        try {

          const response = await solicitarLinkPago({ contrato_id: data.contrato_id, tipo_pago: data.tipo_pago, monto_saldo: data.monto_saldo })

          if (response.data.success && response.data.pago_url != null) {
            return {
              ...SCREEN_RESPONSES.LINK,
              data: {
                ...SCREEN_RESPONSES.LINK.data,
                link_pago: response.data.pago_url,
                monto_a_pagar: response.data.monto_pasarela,
              },
            };
          } else {
            return {
              ...SCREEN_RESPONSES.ERROR,
              data: {
                ...SCREEN_RESPONSES.ERROR.data,
                error_msg: response.status === 500 ? 'No se pudo generar el link de pago. Por favor, inténtalo de nuevo más tarde.' : response.data.message
              },
            };
          }

        } catch (error) {
          console.error('Error al generar link de pago:', error);


          if (error.status === 500){
            return {
              ...SCREEN_RESPONSES.ERROR,
              data: {
                ...SCREEN_RESPONSES.ERROR.data,
                error_msg: 'Ocurrió un error al generar el link de pago. Por favor, inténtalo de nuevo más tarde.'
              },
            }
          } else {
            return {
              ...SCREEN_RESPONSES.END,
              data: {
                ...SCREEN_RESPONSES.END.data,
                end_msg: error.response.data.message
              },
            };
          }

        }

      default:
        break;
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
};
