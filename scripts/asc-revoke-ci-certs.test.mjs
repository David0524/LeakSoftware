import { generateKeyPairSync, verify } from "node:crypto";
import assert from "node:assert/strict";
import { ascToken, madeByCi } from "./asc-revoke-ci-certs.mjs";

// The token: ES256 over header.payload, for App Store Connect.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const p8 = privateKey.export({ type: "pkcs8", format: "pem" });
const t = ascToken({ keyId: "K1", issuerId: "I1", p8 }, 1000);
const [h, p, s] = t.split(".");
assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "ES256", kid: "K1", typ: "JWT" });
assert.deepEqual(JSON.parse(Buffer.from(p, "base64url")), {
  iss: "I1",
  iat: 1000,
  exp: 1600,
  aud: "appstoreconnect-v1",
});
assert.ok(
  verify(
    "sha256",
    Buffer.from(`${h}.${p}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(s, "base64url"),
  ),
);

// Only development certificates made through the API.
const cert = (certificateType, name) => ({ attributes: { certificateType, name } });
assert.equal(madeByCi(cert("DEVELOPMENT", "Apple Development: Created via API")), true);
assert.equal(madeByCi(cert("IOS_DEVELOPMENT", "iOS Developer: Created via API")), true);
assert.equal(madeByCi(cert("DEVELOPMENT", "Apple Development: Dana Owner")), false);
assert.equal(madeByCi(cert("DISTRIBUTION", "Apple Distribution: Created via API")), false);
assert.equal(madeByCi({}), false);
console.log("asc-revoke-ci-certs: ok");
