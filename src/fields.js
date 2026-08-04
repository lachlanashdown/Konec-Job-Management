// Shared definition of the fixed checklist fields.
// type: 'text' | 'currency' | 'boolean'
// Loaded by the server (CommonJS) — mirrored in public/js/fields.js for the browser.
const CHECKLIST_FIELDS = [
  { key: 'projectAddress', label: 'Project Address', type: 'text' },
  { key: 'builder', label: 'Builder', type: 'text' },
  { key: 'builderContact', label: 'Builder Contact', type: 'text' },
  { key: 'client', label: 'Client', type: 'text' },
  { key: 'clientContact', label: 'Client Contact', type: 'text' },
  { key: 'totalJobCost', label: 'Total Job Cost', type: 'currency' },
  { key: 'commissioning', label: 'Commissioning', type: 'boolean' },
  { key: 'commissioningRate', label: 'Commissioning Rate', type: 'currency' },
];

function defaultChecklist() {
  const checklist = {};
  for (const field of CHECKLIST_FIELDS) {
    checklist[field.key] = {
      value: field.type === 'boolean' ? false : '',
      checked: false,
      note: '',
    };
  }
  return checklist;
}

module.exports = { CHECKLIST_FIELDS, defaultChecklist };
