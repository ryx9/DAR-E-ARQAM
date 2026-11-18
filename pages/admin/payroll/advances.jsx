import PayrollModule from '../../../components/payroll/PayrollModule';
import AdvanceManagement from '../../../components/payroll/AdvanceManagement';

export default function Page() {
  return (
    <PayrollModule section="advances">
      {context => <AdvanceManagement {...context} embedded />}
    </PayrollModule>
  );
}
