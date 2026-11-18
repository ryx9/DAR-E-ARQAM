import PayrollModule from '../../../components/payroll/PayrollModule';
import SalaryPayments from '../../../components/payroll/SalaryPayments';

export default function Page() {
  return (
    <PayrollModule section="payments">{context => <SalaryPayments {...context} />}</PayrollModule>
  );
}
