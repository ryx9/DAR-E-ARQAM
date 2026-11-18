import PayrollModule from '../../../components/payroll/PayrollModule';
import PayrollSettings from '../../../components/payroll/PayrollSettings';

export default function Page() {
  return (
    <PayrollModule section="settings" needsProfiles>
      {context => <PayrollSettings {...context} />}
    </PayrollModule>
  );
}
