import { initKeysList } from './features/keys-list';
import { initSubmitForm } from './features/submit';
import { initTestConsole } from './features/test/console';

export function initApp(): void {
  const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
  const jumpSubmit = document.getElementById('jump-submit') as HTMLButtonElement;
  const jumpTest = document.getElementById('jump-test') as HTMLButtonElement;

  let keysListApi: ReturnType<typeof initKeysList> | null = null;
  const testConsole = initTestConsole({
    onResults: (results) => {
      keysListApi?.updateTestResults(results);
    },
    onClear: () => {
      keysListApi?.clearTestResults();
    },
  });
  const keysList = initKeysList({
    onLocalTest: (record) => testConsole.prefillFromRecord(record),
  });
  keysListApi = keysList;

  initSubmitForm({
    onSubmitSuccess: () => {
      void keysList.reload();
    },
  });

  refreshBtn.addEventListener('click', () => {
    void keysList.reload();
  });
  jumpSubmit.addEventListener('click', () => {
    document.getElementById('submit')?.scrollIntoView({ behavior: 'smooth' });
  });
  jumpTest.addEventListener('click', () => {
    document.getElementById('test')?.scrollIntoView({ behavior: 'smooth' });
  });
}
