import PayrollModule from '../../../components/payroll/PayrollModule';
import SalaryReview from '../../../components/payroll/SalaryReview';

export default function Page() {
  return (
    <PayrollModule section="drafts" needsProfiles>
      {context => <SalaryReview {...context} mode="drafts" />}
    </PayrollModule>
  );
}
