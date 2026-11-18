import PayrollModule from '../../../components/payroll/PayrollModule';
import SalaryReview from '../../../components/payroll/SalaryReview';

export default function Page() {
  return (
    <PayrollModule section="approval">
      {context => <SalaryReview {...context} mode="approval" />}
    </PayrollModule>
  );
}
