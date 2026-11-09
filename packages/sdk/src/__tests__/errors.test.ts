import { xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { FosayError, contractErrorCodes, decodeError, decodeSimulationError, redactSecrets } from '../errors';

function diagWithContractError(code: number): xdr.DiagnosticEvent {
  return new xdr.DiagnosticEvent({
    inSuccessfulContractCall: false,
    event: new xdr.ContractEvent({
      ext: new xdr.ExtensionPoint(0),
      contractId: null,
      type: xdr.ContractEventType.diagnostic(),
      body: new xdr.ContractEventBody(
        0,
        new xdr.ContractEventV0({
          topics: [xdr.ScVal.scvSymbol('error'), xdr.ScVal.scvError(xdr.ScError.sceContract(code))],
          data: xdr.ScVal.scvString('escalating error to panic'),
        }),
      ),
    }),
  });
}

describe('error decoding', () => {
  it('finds policy errors in diagnostic events behind Error(Auth, InvalidAction)', () => {
    const sim = {
      error: 'HostError: Error(Auth, InvalidAction)\n\nEvent log (newest first): ...',
      events: [diagWithContractError(4109)],
    };
    const e = decodeSimulationError(sim);
    expect(e.code).toBe('BudgetExceeded');
    expect(e.message).toMatch(/approval/);
    expect(e.details['codes']).toEqual([4109]);
  });

  it('maps per-tx cap, approvals codes and text-only codes', () => {
    expect(decodeSimulationError({ events: [diagWithContractError(4107)] }).code).toBe('PerTxLimitExceeded');
    expect(decodeSimulationError({ error: 'HostError: Error(Contract, #4207)' }).code).toBe('TooManyPending');
    expect(contractErrorCodes([diagWithContractError(4104)], 'x Error(Contract, #4201) y').sort()).toEqual([
      4104, 4201,
    ]);
  });

  it('falls back to AUTH_REJECTED and SIMULATION_FAILED', () => {
    expect(decodeSimulationError({ error: 'HostError: Error(Auth, InvalidAction)' }).code).toBe(
      'AUTH_REJECTED',
    );
    expect(decodeSimulationError({ error: 'HostError: Error(Budget, ExceededLimit)' }).code).toBe(
      'SIMULATION_FAILED',
    );
    expect(decodeError(new Error('Error(Contract, #4100)')).code).toBe('NotInstalled');
  });

  it('never leaks secret seeds', () => {
    const seed = 'SBHG7C3KNZCZPP2SCBLAHH6TBQNI6K6RX2RPOAMMSKMRJ5LB6ZHO7MGG';
    expect(redactSecrets(`bad key ${seed}`)).not.toContain(seed);
    expect(new FosayError('UNKNOWN', `oops ${seed}`).message).not.toContain(seed);
  });
});
