import { Fragment } from 'react';
import type { SlotMap, SlotName } from './feature';
import { FeatureBoundary } from './FeatureBoundary';
import { useSlot } from './hooks';

/** Renders what active features put in the slot `name`, passing them the slot's props. */
export function Slot<K extends SlotName>({ name, ...props }: { name: K } & SlotMap[K]) {
  const items = useSlot(name);
  return (
    <>
      {items.map(({ id, featureId, component: Item }) => (
        <Fragment key={`${featureId}:${id}`}>
          <FeatureBoundary featureId={featureId}>
            <Item {...(props as unknown as SlotMap[K])} />
          </FeatureBoundary>
        </Fragment>
      ))}
    </>
  );
}
