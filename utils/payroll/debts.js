import { supabase } from '../supabaseClient';

export function readRequests(employeeId) {
  let query = supabase.from('staff_advances_with_emails').select('*');
  if (employeeId) query = query.eq('staff_id', employeeId).eq('status', 'approved');
  return query.order('requested_at', { ascending: false });
}

export function readLegacyLoans(employeeId) {
  let query = supabase
    .from('payroll_loans')
    .select(
      'id, profile_id, principal, loan_date, reason, payroll_loan_payments(id,amount,paid_at)'
    );
  if (employeeId) query = query.eq('profile_id', employeeId);
  return query;
}

export function legacyLoanBalance(loan) {
  return (
    Number(loan.principal) -
    (loan.payroll_loan_payments || []).reduce((sum, p) => sum + Number(p.amount), 0)
  );
}
