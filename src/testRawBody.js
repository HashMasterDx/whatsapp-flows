import crypto from "crypto";

let req = {"encrypted_flow_data":"mDHRpYGLpQaccrVB24Oo8twY91LeVpcC5wyTwiRFkrWPM+WYcX7PHWW\/5m3fGpM21g==","encrypted_aes_key":"Fn8RbSLBON\/6dMkLcbio0umIzN7uYh6TRN+PKZSYidZtMcwwjg1jtAIvgiMZok4XFk1Vy3n1po3qeLSpS5lDDJJvhFfi1USRSWJOI0alfRTaR9BoGVH94YCJ6IbhyuK5A+YEu60Vj9QJWqPIYAeOSUDTXKYzTSdqo6jxX4cnvLL3HRorW6Dfn9ATLorKXVZ3Lw7bR53NRC\/SpW2\/1iU78qs3H1fnHuil0+NXdZl4oS5DHYXN\/Xf6EdiHz\/V3tpWPPZ+Lab\/2bQlrY1\/l4Ug86EoU79InRzd37EPIhg8PoN2KXEMEUkqRRRDE9pCeobm31tA491kwLzJ212rxwl7iQg==","initial_vector":"VcRYNvzoBfVUR7i+J5F2fA=="}
let sha256 = "sha256=2fb1dccf5ad8dd74ab59916d3c7d675a22a2ea49890bb436f78c918fd4ed06fd";

const signatureHeader = req;
const signatureBuffer = Buffer.from(signatureHeader.replace("sha256=", ""), "utf-8");

const hmac = crypto.createHmac("sha256", "b56f454a1bcb94db2d39b5dff95dc7bb");
const digestString = hmac.update(sha256).digest('hex');
const digestBuffer = Buffer.from(digestString, "utf-8");

if ( !crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
  console.error("Error: Request Signature did not match");
}
console.log("Signatures match");
