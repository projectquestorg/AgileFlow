/**
 * Tests for tmux-group-colors.js
 */

const {
  GROUP_PALETTE,
  AUDIT_COLOR_MAP,
  getColorForAudit,
  pickGroupColor,
  getColorByName,
  buildGroupWindowFormat,
  getAllColors,
} = require('../../../scripts/lib/tmux-group-colors');

describe('tmux-group-colors', () => {
  describe('GROUP_PALETTE', () => {
    it('has 8 colors', () => {
      expect(GROUP_PALETTE).toHaveLength(8);
    });

    it('each entry has name, hex, and audit fields', () => {
      for (const entry of GROUP_PALETTE) {
        expect(entry.name).toBeTruthy();
        expect(entry.hex).toMatch(/^#[0-9a-f]{6}$/i);
        expect(entry).toHaveProperty('audit');
      }
    });

    it('has unique names', () => {
      const names = GROUP_PALETTE.map(e => e.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('has unique hex colors', () => {
      const hexes = GROUP_PALETTE.map(e => e.hex.toLowerCase());
      expect(new Set(hexes).size).toBe(hexes.length);
    });

    it('assigns 6 colors to audit types', () => {
      const assigned = GROUP_PALETTE.filter(e => e.audit !== null);
      expect(assigned).toHaveLength(6);
    });

    it('has 2 unassigned colors for additional groups', () => {
      const unassigned = GROUP_PALETTE.filter(e => e.audit === null);
      expect(unassigned).toHaveLength(2);
    });
  });

  describe('AUDIT_COLOR_MAP', () => {
    it('maps all 6 audit types', () => {
      expect(AUDIT_COLOR_MAP).toHaveProperty('security');
      expect(AUDIT_COLOR_MAP).toHaveProperty('logic');
      expect(AUDIT_COLOR_MAP).toHaveProperty('performance');
      expect(AUDIT_COLOR_MAP).toHaveProperty('test');
      expect(AUDIT_COLOR_MAP).toHaveProperty('completeness');
      expect(AUDIT_COLOR_MAP).toHaveProperty('legal');
    });

    it('all values are valid hex colors', () => {
      for (const hex of Object.values(AUDIT_COLOR_MAP)) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });

  describe('getColorForAudit', () => {
    it('returns coral for security', () => {
      expect(getColorForAudit('security')).toBe('#f7768e');
    });

    it('returns sky for logic', () => {
      expect(getColorForAudit('logic')).toBe('#7aa2f7');
    });

    it('returns a color for unknown audit type', () => {
      const color = getColorForAudit('unknown');
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe('pickGroupColor', () => {
    it('picks a valid color', () => {
      const color = pickGroupColor([]);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('avoids in-use colors', () => {
      const inUse = ['#f7768e', '#7aa2f7', '#73daca', '#e0af68', '#bb9af7', '#9ece6a', '#ff9e64'];
      const color = pickGroupColor(inUse);
      expect(inUse.map(c => c.toLowerCase())).not.toContain(color.toLowerCase());
    });

    it('returns first palette color when all are in use', () => {
      const allColors = GROUP_PALETTE.map(e => e.hex);
      const color = pickGroupColor(allColors);
      expect(color).toBe(GROUP_PALETTE[0].hex);
    });

    it('handles case-insensitive avoidance', () => {
      const inUse = ['#F7768E']; // uppercase
      const colors = new Set();
      for (let i = 0; i < 50; i++) {
        colors.add(pickGroupColor(inUse));
      }
      expect(colors.has('#f7768e')).toBe(false);
    });

    it('handles null/undefined input', () => {
      const color = pickGroupColor(null);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe('getColorByName', () => {
    it('returns entry for valid name', () => {
      const entry = getColorByName('coral');
      expect(entry).toBeTruthy();
      expect(entry.hex).toBe('#f7768e');
      expect(entry.audit).toBe('security');
    });

    it('returns null for invalid name', () => {
      expect(getColorByName('invalid')).toBeNull();
    });
  });

  describe('buildGroupWindowFormat', () => {
    it('builds active format with group color', () => {
      const format = buildGroupWindowFormat('#f7768e', 'Sec', true);
      expect(format).toContain('#f7768e');
      expect(format).toContain('Sec');
      expect(format).toContain('bold');
    });

    it('builds inactive format with gray text', () => {
      const format = buildGroupWindowFormat('#7aa2f7', 'Logic', false);
      expect(format).toContain('#7aa2f7');
      expect(format).toContain('#8a8a8a');
      expect(format).toContain('Logic');
    });
  });

  describe('getAllColors', () => {
    it('returns a copy of the palette', () => {
      const colors = getAllColors();
      expect(colors).toHaveLength(8);
      expect(colors).not.toBe(GROUP_PALETTE);
      expect(colors[0]).toEqual(GROUP_PALETTE[0]);
    });
  });
});
