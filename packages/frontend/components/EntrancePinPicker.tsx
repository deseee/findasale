/**
 * EntrancePinPicker.tsx
 *
 * Component for organizers to drop a pin on a map marking the entrance/parking location.
 * Shows the sale address as primary marker (blue), entrance as secondary (green door).
 * Returns { entranceLat, entranceLng, entranceNote } on change.
 */

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

interface EntrancePinPickerProps {
  saleAddress: string;
  saleLat: number;
  saleLng: number;
  initialEntranceLat?: number;
  initialEntranceLng?: number;
  initialEntranceNote?: string;
  onChange: (data: { entranceLat?: number; entranceLng?: number; entranceNote?: string }) => void;
}

// Dynamically import the inner component (no SSR) so Leaflet doesn't crash on server
const EntrancePinPickerInner = dynamic(() => import('./EntrancePinPickerInner'), { ssr: false });

const EntrancePinPicker: React.FC<EntrancePinPickerProps> = (props) => {
  return <EntrancePinPickerInner {...props} />;
};

export default EntrancePinPicker;
