export function getAllMetadata(o: any) {
  return Object.fromEntries(Reflect.getMetadataKeys(o).map(k => [k, Reflect.getMetadata(k, o)]));
}

export function getAllPropertyMetadata(o: any, key: string | symbol) {
  return Object.fromEntries(Reflect.getMetadataKeys(o, key).map(k => [k, Reflect.getMetadata(k, o, key)]));
}

export function doAppendArrayMetadata<V>(
  metadataKey: string,
  metadataValue: V | Array<V>,
  target: any,
  key?: string | symbol,
) {
  const current =
    (key
      ? Reflect.getMetadata(metadataKey, target, key)
      : Reflect.getMetadata(metadataKey, target)
    ) || [];
  const values: Array<V> = [current, metadataValue].flat(Infinity);

  if (key) {
    Reflect.defineMetadata(metadataKey, values, target, key);
  } else {
    Reflect.defineMetadata(metadataKey, values, target);
  }

  if (process.env.NESTJS_AUTH_BUILD_TIME_DEBUG) {
    console.log(target, key, 'before: ', current, 'after: ', values);
  }
}

export function AppendArrayMetadata<V>(
  metadataKey: string,
  metadataValue: V | Array<V>,
): MethodDecorator {
  return (target, propertyKey) => {
    doAppendArrayMetadata(metadataKey, metadataValue, target, propertyKey);

    if (process.env.NESTJS_AUTH_BUILD_TIME_DEBUG) {
      console.log(`${target} : ` +
        `${propertyKey && String(propertyKey)} @ ` +
        `${metadataKey}: ${Reflect.getMetadata(metadataKey, target, propertyKey)}`);
    }
  };
}
