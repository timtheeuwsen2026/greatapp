import { createContext, useContext } from "react";

/**
 * True for a page shown inside the organiser's menu (OrganiserShell). A page
 * that also stands on its own (Promote, Settings) leaves out its own top bar
 * there, because the shell already shows it.
 */
export const InOrganiserShell = createContext(false);

export function useInOrganiserShell(): boolean {
  return useContext(InOrganiserShell);
}
