import PayrollModule from '../../../components/payroll/PayrollModule';
import AttendanceImport from '../../../components/payroll/AttendanceImport';

export default function Page() {
  return (
    <PayrollModule section="attendance" needsProfiles>
      {context => <AttendanceImport {...context} />}
    </PayrollModule>
  );
}
