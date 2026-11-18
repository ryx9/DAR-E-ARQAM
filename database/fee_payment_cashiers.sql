-- Attribute every newly recorded fee payment to the authenticated cashier profile.
-- Existing payments intentionally remain NULL so historical records are not guessed or rewritten.
ALTER TABLE public.fee_payments
  ADD COLUMN IF NOT EXISTS cashier_profile_id uuid;

ALTER TABLE public.fee_payments
  DROP CONSTRAINT IF EXISTS fee_payments_cashier_profile_id_fkey;

ALTER TABLE public.fee_payments
  ADD CONSTRAINT fee_payments_cashier_profile_id_fkey
  FOREIGN KEY (cashier_profile_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fee_payments_cashier_profile_id_idx
  ON public.fee_payments(cashier_profile_id);
