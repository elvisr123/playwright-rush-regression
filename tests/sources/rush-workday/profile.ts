import { SOURCES } from '../../config/sources';

/** Admin → Sources link. */
export const WORKDAY_SOURCE = SOURCES.workday;

/** Identity Accounts tab shows title case, not `RUSH Workday`. */
export const WORKDAY_ACCOUNT_SOURCE = 'Rush Workday';

/** Workday account fields that apply on termination-related lifecycles (termed, inactive). */
export const WORKDAY_TERMINATION_ACCOUNT_FIELDS = ['Legal_Hold', 'Manager_Hold'];
