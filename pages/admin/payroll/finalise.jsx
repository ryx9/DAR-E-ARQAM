import PayrollModule from '../../../components/payroll/PayrollModule';
import SalaryReview from '../../../components/payroll/SalaryReview';

export default function Page() {
  return (
    <PayrollModule section="finalise">
      {context => <SalaryReview {...context} mode="finalise" />}
    </PayrollModule>
  );
}
