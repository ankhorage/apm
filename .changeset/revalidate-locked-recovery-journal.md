---
'@ankhorage/apm': patch
---

Re-read and revalidate the durable operation journal after acquiring the recovery lock. Preserve completion and step progress committed by another caller, reject missing or replaced operation state before effects, and always release the acquired lock if the authoritative read fails.
