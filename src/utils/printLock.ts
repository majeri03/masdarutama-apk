import { Alert } from 'react-native';

let globalPrintInProgress = false;

/**
 * Tries to acquire the printing lock.
 * Returns true if lock is successfully acquired, or false if already printing.
 */
export const acquirePrintLock = (): boolean => {
  if (globalPrintInProgress) {
    Alert.alert(
      'Printer Sibuk',
      'Permintaan cetak sedang diproses. Mohon tunggu beberapa saat sebelum mencoba kembali.'
    );
    return false;
  }
  globalPrintInProgress = true;
  return true;
};

/**
 * Releases the printing lock.
 */
export const releasePrintLock = (): void => {
  globalPrintInProgress = false;
};

/**
 * Checks if a print request is currently active.
 */
export const isPrintingActive = (): boolean => {
  return globalPrintInProgress;
};
