import PayrollModule from '../../../components/payroll/PayrollModule';
import ShiftManagement from '../../../components/payroll/ShiftManagement';

export default function Page() {
  return (
    <PayrollModule section="shifts" needsProfiles>
      {context => <ShiftManagement {...context} />}
    </PayrollModule>
  );
}
