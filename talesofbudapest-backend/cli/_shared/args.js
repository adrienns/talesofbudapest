export const option = (args, name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? fallback;
};

export const numberOption = (args, name, fallback) => Number(option(args, name, fallback));

export const hasFlag = (args, flag) => args.includes(flag);

export const requiredOption = (args, name) => {
  const value = option(args, name);
  if (value == null || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
};
