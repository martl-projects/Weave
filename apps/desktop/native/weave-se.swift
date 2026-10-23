// weave-se: a Secure Enclave key for Weave's home key (docs/v2-stage17.md).
// Built for macOS with the app (apps/desktop/package.ts) and run by the Weave
// node (packages/node/src/vault.ts). Two commands, JSON and base64 in and out:
//
//   create   a new key agreement key inside the Secure Enclave; prints
//            {"blob": …, "publicKey": …}. The blob is the key as the Secure
//            Enclave seals it: only this Mac's Secure Enclave can use it.
//   agree    reads {"blob": …, "peer": …} and prints the shared secret of a
//            P-256 key agreement with the peer's public key (X9.63).
//
// The rest (the peer's key, deriving the sealing key, sealing the home key)
// happens in the node. CryptoKit keeps Secure Enclave keys as blobs, so no
// keychain access or entitlement is needed.

import CryptoKit
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

guard SecureEnclave.isAvailable else { fail("this Mac has no Secure Enclave") }

switch CommandLine.arguments.dropFirst().first ?? "" {
case "create":
  do {
    let key = try SecureEnclave.P256.KeyAgreement.PrivateKey()
    let out = ["blob": key.dataRepresentation.base64EncodedString(), "publicKey": key.publicKey.x963Representation.base64EncodedString()]
    print(String(data: try JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
  } catch {
    fail("the Secure Enclave made no key: \(error)")
  }
case "agree":
  let input = FileHandle.standardInput.readDataToEndOfFile()
  guard let json = (try? JSONSerialization.jsonObject(with: input)) as? [String: String],
    let blob = json["blob"].flatMap({ Data(base64Encoded: $0) }),
    let peer = json["peer"].flatMap({ Data(base64Encoded: $0) })
  else { fail("expected {\"blob\": …, \"peer\": …}") }
  do {
    let key = try SecureEnclave.P256.KeyAgreement.PrivateKey(dataRepresentation: blob)
    let secret = try key.sharedSecretFromKeyAgreement(with: P256.KeyAgreement.PublicKey(x963Representation: peer))
    print(secret.withUnsafeBytes { Data($0) }.base64EncodedString())
  } catch {
    fail("the Secure Enclave refused: \(error)")
  }
default:
  fail("usage: weave-se create | agree")
}
