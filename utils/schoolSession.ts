import { createContext, useContext } from 'react';
import type { SchoolAccess } from './adminDataAccess';

export const SchoolSession = createContext<{ access: SchoolAccess | null; loading: boolean }>({
  access: null,
  loading: true,
});

export const useSchoolSession = () => useContext(SchoolSession);
