DROP RULE IF EXISTS protect_ledger_updates ON ledger_entries;
DROP RULE IF EXISTS protect_ledger_deletes ON ledger_entries;

CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_immutability_trigger ON ledger_entries;
CREATE TRIGGER ledger_immutability_trigger
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_mutation();

CREATE OR REPLACE FUNCTION prevent_ledger_account_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger accounts cannot be deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_account_delete_trigger ON ledger_accounts;
CREATE TRIGGER ledger_account_delete_trigger
BEFORE DELETE ON ledger_accounts
FOR EACH ROW
EXECUTE FUNCTION prevent_ledger_account_delete();
