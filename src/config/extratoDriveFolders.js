export const EXTRATO_DRIVE_FOLDERS_2026 = [
  { mes_num: 1, mes: 'Janeiro', folder_id: '1RV2mZM56GXI2CnDkwSJUp4y_s6uA82QX' },
  { mes_num: 2, mes: 'Fevereiro', folder_id: '1X7Ouq3bWMkw2FKuj5ToNrVqI8GT8fdU1' },
  { mes_num: 3, mes: 'Março', folder_id: '1GPGPwo3mXZHmKLEI87GrfsvlHhnt7S9s' },
  { mes_num: 4, mes: 'Abril', folder_id: '1VaIoAV8U9OFJNpwPQcd7Zg9_FM8NgV44' },
  { mes_num: 5, mes: 'Maio', folder_id: '155LK95qLqmv8QKRqBHUgJescETB1MOsw' },
  { mes_num: 6, mes: 'Junho', folder_id: '166UanEeDSixvVKT7RhQ7edsTOtNqYdBT' },
  { mes_num: 7, mes: 'Julho', folder_id: '10udE1viTbqEtoGdpMZVcRA97SkpcWNsn' },
].map(item => ({
  ...item,
  ano: 2026,
  folder_url: item.folder_id ? `https://drive.google.com/drive/folders/${item.folder_id}` : null,
}));
