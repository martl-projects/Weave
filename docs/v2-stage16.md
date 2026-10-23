# v2 stage 16: AWS KMS and Google Cloud KMS

A company's half of every key can now be held by AWS KMS or Google Cloud KMS, next to HashiCorp Vault and Azure Key Vault. It works the same way as with the others:

- **Each wrap is bound** to its project or group and its key epoch:
  - AWS: the encryption context `{"weave": "weave/kms/v1:<space>:<epoch>"}`
  - Google: the same string as additional authenticated data
- **The company's server** signs in with its own credentials.
- **Employees** sign in as themselves with their company sign-in, so the key service's own log names them.
- **The server's home key** can be held there too (`weave-server init` does it).

## AWS KMS

`{ kind: 'aws', region, key, role }`

| | How |
|---|---|
| **The key** | A symmetric KMS key (its ARN or `alias/…`) |
| **Employees** | Their company sign-in takes on `role` (STS `AssumeRoleWithWebIdentity`) for an hour. CloudTrail names the session `weave-<their email>` |
| **The server** | An IAM user's keys: `WEAVE_AWS_ACCESS_KEY_ID`, `WEAVE_AWS_SECRET_ACCESS_KEY` (`WEAVE_AWS_SESSION_TOKEN` if temporary) |
| **Shredding** | Schedules the key's deletion after AWS's shortest wait, 7 days. It's disabled at once, but AWS can bring it back during the wait |
| **Signing** | Signature Version 4, written here (no AWS SDK) and checked against AWS's published test vectors |

`endpoint` and `sts` name other addresses (VPC endpoints, FIPS).

**Set up in AWS:**
1. An IAM OIDC identity provider for the company's sign-in: its issuer, with Weave's client id as the audience.
2. A role for employees:
   - It trusts that provider (`sts:AssumeRoleWithWebIdentity`, condition `<issuer>:aud` = Weave's client id).
   - It may `kms:Encrypt` and `kms:Decrypt` on the key.
3. An IAM user for the server: `kms:Encrypt`, `kms:Decrypt`, `kms:DescribeKey`, `kms:ScheduleKeyDeletion` on the key.

## Google Cloud KMS

`{ kind: 'gcp', key, workload }`

| | How |
|---|---|
| **The key** | A symmetric Cloud KMS key: `projects/…/locations/…/keyRings/…/cryptoKeys/…` |
| **Employees** | Workload Identity Federation: their company sign-in is exchanged at Google's STS for a federated token. Each person is their own principal (`…/subject/<sub>`), so IAM and the audit logs see them |
| **The server** | A service account's key (`WEAVE_GCP_SERVICE_ACCOUNT`: the JSON, or the file it's in), or an access token (`WEAVE_GCP_TOKEN`) |
| **Shredding** | Destroys every version of the key. Google keeps versions restorable for the key's scheduled-destruction period (30 days by default) |

`workload` is the provider: `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`.

**Set up in Google Cloud:**
1. A workload identity pool, with an OIDC provider for the company's sign-in:
   - its issuer
   - Weave's client id as an allowed audience
   - `google.subject = assertion.sub`
2. The role Cloud KMS CryptoKey Encrypter/Decrypter on the key for the pool's principals: all of them (`principalSet://…/workloadIdentityPools/<pool>/*`), or a mapped group.
3. A service account for the server, with the same role, and permission to destroy key versions.

## Everywhere else

- **`weave-server init`** asks for `vault`, `azure`, `aws` or `gcp`:
  - flags: `--aws-region`, `--aws-key`, `--aws-role`, `--gcp-key`, `--gcp-workload`
  - settings: `WEAVE_AWS_REGION`, `WEAVE_AWS_KEY`, `WEAVE_AWS_ROLE`, `WEAVE_GCP_KEY`, `WEAVE_GCP_WORKLOAD`
- **CLI:** `weave company create <name> aws <region> <key> <role>`, `… gcp <key> <workload>`, and the same for `weave manage`.
- **Weave's own setting names on purpose.** The company server's credentials are read only from `WEAVE_…` settings. A developer's `AWS_…` or Google credentials on their computer never stand in for their company sign-in.
- One place reads the key services' settings from the environment, for the server, its home key and the app.

## As built

- **Tested** against stand-ins for AWS (STS and KMS, checking every request's signature) and Google (STS, OAuth for service accounts, Cloud KMS with versions):
  - **Wrapping:** wrap and unwrap, and refusals for another space or epoch.
  - **Who may sign in:**
    - wrong secrets
    - another service account's key
    - a sign-in for another app
    - a role that doesn't trust it
    - someone disabled in the sign-in
  - **CloudTrail and audit-log names:** the person's.
  - **Shredding:** deletion scheduled, every version destroyed. Older versions still decrypt after a rotation.
  - **End to end on each:**
    - a company on the key service
    - a colleague enrolls with only their sign-in and reads the company group
    - the server's home key opens only through the key service
- **Not tried against the real clouds.**
  - In particular, a federated token used on Cloud KMS directly. If an organization's setup requires it, people would act through a service account they impersonate, which isn't built.
  - A server on EC2, ECS or GKE can't yet use the identity it runs as (instance roles, workload identity); it needs keys in its settings.
