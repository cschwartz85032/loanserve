export const Exchanges = {
  COMMANDS: 'commands',         // direct exchange for commands
  EVENTS:   'loan.events',      // topic exchange for emitted events
};

export const Queues = {
  Import:        'import.command',
  Ocr:           'ocr.command',
  Datapoint:     'datapoint.command',
  Conflict:      'conflict.command',
  Disbursement:  'disbursement.command',
  Escrow:        'escrow.command',
  Ucdp:          'ucdp.command',
  Flood:         'flood.command',
  Hoi:           'hoi.command',
  Title:         'title.command',
};

export function retry(queue: string, suffix: string) {
  return `${queue}.retry.${suffix}`;
}
export function dlq(queue: string) {
  return `${queue}.dlq`;
}