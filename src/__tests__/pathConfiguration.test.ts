import { requireNativeModule } from 'expo-modules-core';

import { getPathProperties, normalizeProperties } from '../pathConfiguration';

const native = requireNativeModule<{ getPathProperties: jest.Mock }>('Hotwire');

describe('normalizeProperties', () => {
  it('lower-cases the enum-valued properties the Android core reports upper case', () => {
    expect(
      normalizeProperties({ context: 'MODAL', presentation: 'POP', modal_style: 'Medium', query_string_presentation: 'REPLACE' })
    ).toEqual({ context: 'modal', presentation: 'pop', modal_style: 'medium', query_string_presentation: 'replace' });
  });

  it('leaves every other property, and non-string enums, alone', () => {
    expect(normalizeProperties({ screen: 'Numbers', pull_to_refresh_enabled: true, context: 1 })).toEqual({
      screen: 'Numbers',
      pull_to_refresh_enabled: true,
      context: 1,
    });
  });

  it('gives an empty object for no properties', () => {
    expect(normalizeProperties(undefined)).toEqual({});
  });
});

describe('getPathProperties', () => {
  it('normalizes what the native side returns', async () => {
    native.getPathProperties.mockResolvedValueOnce({ context: 'MODAL', screen: 'numbers' });

    await expect(getPathProperties('https://example.com/numbers')).resolves.toEqual({ context: 'modal', screen: 'numbers' });
    expect(native.getPathProperties).toHaveBeenCalledWith('https://example.com/numbers');
  });
});
