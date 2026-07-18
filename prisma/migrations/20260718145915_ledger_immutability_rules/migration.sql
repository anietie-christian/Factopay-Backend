CREATE RULE protect_ledger_updates AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
CREATE RULE protect_ledger_deletes AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;
