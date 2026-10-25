# v2 stage 17: keys held in hardware

## What's protected

- A Weave home seals its secret files (device key, encryption keys, agent keys) with a **home key**.
- Until now, the operating system kept that home key: DPAPI, the Keychain, the Secret Service.
- Now the person can keep it in hardware instead.
  - A copied Weave folder, or someone with the user's password and the disk, then gets nothing without the chip or the key.

| Keystore | Where | How |
|---|---|---|
| `tpm` | Windows | A 2048-bit RSA key made inside this computer's TPM (Microsoft Platform Crypto Provider, never exportable) wraps the home key with RSA-OAEP-SHA256. Through PowerShell, like DPAPI |
| `secure-enclave` | macOS | A P-256 key inside the Secure Enclave (CryptoKit) |
| `yubikey` | anywhere with YubiKey Manager | The YubiKey's HMAC-SHA1 challenge-response (slot 2), as KeePassXC uses it |

**How the Secure Enclave keystore works:**
- The enclave keeps the key as a blob only it can use.
- When the home key is stored, the node makes a one-time P-256 key and does a key agreement with the enclave's public key, then forgets the one-time key.
- To open the home, the enclave redoes the agreement. The result (through HKDF) seals the home key.
- The helper is `weave-se` (`apps/desktop/native/weave-se.swift`). The macOS packaging compiles it into the app's Resources, for each architecture.

**How the YubiKey keystore works:**
- The node keeps a random 32-byte challenge.
- The key's answer (through HKDF) seals the home key.
- Set the slot up once with `ykman otp chalresp --generate 2`, with `--touch` to require a touch.

## Choosing

- **CLI:** `weave keystore` lists what this computer offers, and why the others aren't here; `weave keystore tpm|secure-enclave|yubikey|os|file` moves the key there.
- **The app:** Keys & devices → On this computer → **Keep it in**. Before moving into hardware, it says that losing the hardware means setting Weave up again from the recovery words, or by the company.
- **When the home is made:** `WEAVE_KEYSTORE=tpm` (or another) puts it there from the start. A hardware keystore that was asked for must work, or there's no home.
- **Moving keeps the same home key,** so nothing else is resealed.
  - The new keystore is checked by asking for the key back before it's used.
  - Moving away removes what the old keystore held: the TPM key, the Keychain item, the Secret Service item.
- **Locating helpers:**
  - `ykman`: from where its installers put it, or `WEAVE_YKMAN`.
  - `weave-se`: from the app, or `WEAVE_SECURE_ENCLAVE_HELPER`.
  - Either setting may be a JSON list of a program and its arguments.
- **Error messages** say what the helper said: no YubiKey detected, the slot not set up, no Secure Enclave. Not the command line.

## As built

- **Tested here, for real:** the TPM, on this Windows computer:
  - moving into it, and reopening the home in a new process
  - moving away, which deletes the TPM key
  - a home made in the TPM from the start
  - in the app: choosing the TPM in Keys & devices moved the key there, and the page then named it
  - The TPM test is skipped in CI, whose virtual machines may have no TPM.
- **Tested with stand-ins** for `weave-se` and `ykman`: the node's half.
  - **Secure Enclave:** key agreement, sealing, reopening, moving on to another keystore, and refusal when the enclave is unreachable.
  - **YubiKey:** challenge and answer, reopening, refusal when it's unplugged or another YubiKey answers, and refusal of the move when there's none.
- **Not tried:**
  - `weave-se` on a real Mac. It's compiled by the macOS installer build; nobody has run it yet.
  - A real YubiKey.
  - Touch ID or a PIN for each unlock. The enclave key is made without an access control; adding `.userPresence` would ask each time the home opens.
  - A YubiKey's PIV or FIDO2 (hmac-secret) instead of challenge-response.
- **Not built:**
  - The company's server keeps its home key in the company's key service (stage 14), not in hardware.
  - A TPM on Linux (tpm2-tools).
