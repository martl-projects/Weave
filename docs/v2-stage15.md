# v2 stage 15: the console for more than admins

## 1. Roles

Who may do what in the admin console is decided by sign-in group, like admins already were. The groups are set in Policy, or with `weave company auditors|helpdesk <group>|-`.

| Role | Sees | Does |
|---|---|---|
| **Admin** | everything | everything |
| **Auditor** | every page, read-only | nothing. Settings pages show as they are; the export for legal search works |
| **Helpdesk** | Overview and People | invitations, enrollment links, recovery for a new computer |

- The company's node checks each call against the role; the app only hides what a role can't use.
- The audit records the role with each console action that isn't an admin's.
- Someone in none of the three groups is refused at sign-in.

## 2. Approving agents

- A new **Agents** page lists the agents of the company's people.
  - Each agent shows the projects and groups its person is in, and where it's approved.
  - **Approve** and **Revoke** per project or group.
- The company's node does it, as the manager of its spaces. It's recorded in the audit (`agent-on`, `agent-off`).
- The agent's own node sees the change at the next sync: where it's blocked (agentBlocked) follows.

## 3. Each person's company computer

- People's **Computer** column shows:
  - the certificate their last vouched sign-in came with
  - until when it's valid (in amber within two weeks)
  - or, with a device authority set, why their last sign-in wasn't vouched for: no certificate, another authority, expired, not valid yet, or a key that didn't sign the sign-in
- **Where it comes from:**
  - The company's node keeps why it refused a sign-in. After a restart, it learns it again on the next check.
  - Attestations now carry the certificate's expiry.
- `companyDevices()` returns the same for the console's `/api/devices`.

## 4. Searching the audit

- **Filters:**
  - from and to dates (a date alone means that whole day)
  - a person
  - words, all of which must appear: kinds, names, emails, actions, roles
  - the project or group, as before
- **A person's lines:**
  - what they did
  - lines that name them: their key, or their sign-in's subject or email
- **The API:** `/api/audit?since=&until=&person=&q=&space=`; `audit()` takes `until`.

## 5. Retention per project

- A project or group can have its own minimum and maximum. Everything else keeps the company's.
  - **The console:** Projects and groups → Kept.
  - **CLI:** `weave company retention <min|-> [max|-] --in <space>`. `- -` goes back to the company's.
- **Where it's kept:** in the company's settings, `spaceRetention`, so every node holds the space to it: lifetimes, board rules, shredding.
- The company's node shreds each space by its own maximum.
- **Fixed on the way:** clearing the device authority (`deviceCA: null`) didn't take effect when the settings also carried the sign-in.

## As built

- **Tested:**
  - **Roles:**
    - auditor reads and is refused every change
    - helpdesk makes links and is refused the audit, agents, SCIM, streams and freezing
    - someone in no group is refused at sign-in
  - **Agents:** approving from the console unblocks the agent on the person's node.
  - **Audit search:** by person, by words (including a role), and by dates.
  - **Device status:** a company laptop, a laptop from another authority, and none.
  - **Retention:** a project with its own maximum is shredded while another keeps the company's minimum, and goes back to the company's.
- **Looked at in the browser:**
  - with `apps/console/dev.ts`, whose sign-in page now offers an admin, an auditor and the helpdesk
  - the Agents page (approve), People, the audit search and Projects and groups
  - the helpdesk's two pages
  - the auditor's read-only Policy
