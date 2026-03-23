import { PrismaClient, OrderStatus } from '@prisma/client';

const DEMO_COMPANY_NAME = 'Empresa Teste - Apresentacao';
const DEMO_COMPANY_CNPJ = '12.345.678/0001-90';

type DemoTrackingEvent = {
  status: string;
  description: string;
  eventDate: Date;
  city?: string;
  state?: string;
};

type DemoOrder = {
  orderNumber: string;
  invoiceNumber: string;
  trackingCode: string;
  customerName: string;
  corporateName?: string;
  cpf: string;
  phone: string;
  mobile: string;
  salesChannel: string;
  freightType: string;
  freightValue: number;
  shippingDate: Date;
  address: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  totalValue: number;
  recipient: string;
  maxShippingDeadline: Date;
  estimatedDeliveryDate: Date;
  status: OrderStatus;
  isDelayed: boolean;
  trackingEvents: DemoTrackingEvent[];
};

const daysAgo = (days: number, hour = 10) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
};

const daysFromNow = (days: number, hour = 18) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

const withTime = (base: Date, hour: number, minute: number) => {
  const date = new Date(base);
  date.setHours(hour, minute, 0, 0);
  return date;
};

const buildDemoOrders = (): DemoOrder[] => {
  const shippedBase = daysAgo(5);
  const onRouteBase = daysAgo(2);
  const deliveredOnTimeBase = daysAgo(6);
  const deliveredLateBase = daysAgo(10);
  const failureBase = daysAgo(4);
  const returnedBase = daysAgo(8);
  const pendingBase = daysAgo(1);
  const createdBase = daysAgo(2);
  const channelBase = daysAgo(3);

  return [
    {
      orderNumber: 'DEMO-1001',
      invoiceNumber: 'NF-900001',
      trackingCode: 'TRKDEMO1001',
      customerName: 'Mariana Souza',
      corporateName: 'Studio Essencial Decor',
      cpf: '123.456.789-09',
      phone: '(11) 3333-1001',
      mobile: '(11) 98888-1001',
      salesChannel: 'Loja Online',
      freightType: 'Transportadora Horizonte',
      freightValue: 34.9,
      shippingDate: pendingBase,
      address: 'Rua das Acacias',
      number: '145',
      complement: 'Apto 32',
      neighborhood: 'Jardim Primavera',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01311-000',
      totalValue: 389.9,
      recipient: 'Mariana Souza',
      maxShippingDeadline: daysAgo(0),
      estimatedDeliveryDate: daysFromNow(2),
      status: OrderStatus.PENDING,
      isDelayed: false,
      trackingEvents: [
        {
          status: 'PENDING',
          description: 'Pedido importado para demonstracao e aguardando expedicao.',
          eventDate: withTime(pendingBase, 9, 20),
          city: 'Sao Paulo',
          state: 'SP',
        },
      ],
    },
    {
      orderNumber: 'DEMO-1002',
      invoiceNumber: 'NF-900002',
      trackingCode: 'TRKDEMO1002',
      customerName: 'Carlos Henrique',
      cpf: '234.567.890-10',
      phone: '(21) 3333-1002',
      mobile: '(21) 97777-1002',
      salesChannel: 'Televendas',
      freightType: 'Transportadora Atlas',
      freightValue: 28.5,
      shippingDate: createdBase,
      address: 'Avenida Central',
      number: '802',
      neighborhood: 'Centro',
      city: 'Rio de Janeiro',
      state: 'RJ',
      zipCode: '20040-002',
      totalValue: 249.0,
      recipient: 'Carlos Henrique',
      maxShippingDeadline: daysAgo(1),
      estimatedDeliveryDate: daysFromNow(1),
      status: OrderStatus.CREATED,
      isDelayed: false,
      trackingEvents: [
        {
          status: 'CREATED',
          description: 'Etiqueta gerada na transportadora e coleta agendada.',
          eventDate: withTime(createdBase, 14, 10),
          city: 'Rio de Janeiro',
          state: 'RJ',
        },
      ],
    },
    {
      orderNumber: 'DEMO-1003',
      invoiceNumber: 'NF-900003',
      trackingCode: 'TRKDEMO1003',
      customerName: 'Luciana Prado',
      cpf: '345.678.901-21',
      phone: '(31) 3333-1003',
      mobile: '(31) 96666-1003',
      salesChannel: 'Marketplace B2B',
      freightType: 'Transportadora Aurora',
      freightValue: 42.0,
      shippingDate: shippedBase,
      address: 'Rua Serra Azul',
      number: '77',
      neighborhood: 'Funcionarios',
      city: 'Belo Horizonte',
      state: 'MG',
      zipCode: '30130-110',
      totalValue: 579.9,
      recipient: 'Luciana Prado',
      maxShippingDeadline: daysAgo(4),
      estimatedDeliveryDate: daysFromNow(1),
      status: OrderStatus.SHIPPED,
      isDelayed: false,
      trackingEvents: [
        {
          status: 'CREATED',
          description: 'Pedido coletado no CD da empresa.',
          eventDate: withTime(shippedBase, 8, 45),
          city: 'Belo Horizonte',
          state: 'MG',
        },
        {
          status: 'SHIPPED',
          description: 'Carga em transferencia para a unidade de destino.',
          eventDate: withTime(daysAgo(3), 16, 5),
          city: 'Contagem',
          state: 'MG',
        },
      ],
    },
    {
      orderNumber: 'DEMO-1004',
      invoiceNumber: 'NF-900004',
      trackingCode: 'TRKDEMO1004',
      customerName: 'Fernanda Lima',
      cpf: '456.789.012-32',
      phone: '(41) 3333-1004',
      mobile: '(41) 95555-1004',
      salesChannel: 'App Vendas',
      freightType: 'Transportadora Rota Sul',
      freightValue: 31.75,
      shippingDate: onRouteBase,
      address: 'Rua das Laranjeiras',
      number: '550',
      complement: 'Casa 2',
      neighborhood: 'Batel',
      city: 'Curitiba',
      state: 'PR',
      zipCode: '80420-090',
      totalValue: 312.4,
      recipient: 'Fernanda Lima',
      maxShippingDeadline: daysAgo(1),
      estimatedDeliveryDate: daysFromNow(0),
      status: OrderStatus.DELIVERY_ATTEMPT,
      isDelayed: false,
      trackingEvents: [
        {
          status: 'SHIPPED',
          description: 'Objeto em rota para a unidade de distribuicao.',
          eventDate: withTime(onRouteBase, 7, 30),
          city: 'Curitiba',
          state: 'PR',
        },
        {
          status: 'TO_BE_DELIVERED',
          description: 'Saiu para entrega ao destinatario.',
          eventDate: withTime(daysAgo(0), 8, 10),
          city: 'Curitiba',
          state: 'PR',
        },
      ],
    },
    {
      orderNumber: 'DEMO-1005',
      invoiceNumber: 'NF-900005',
      trackingCode: 'TRKDEMO1005',
      customerName: 'Ricardo Nogueira',
      cpf: '567.890.123-43',
      phone: '(51) 3333-1005',
      mobile: '(51) 94444-1005',
      salesChannel: 'Loja Fisica',
      freightType: 'Transportadora Delta',
      freightValue: 19.9,
      shippingDate: deliveredOnTimeBase,
      address: 'Avenida Atlantica',
      number: '98',
      neighborhood: 'Menino Deus',
      city: 'Porto Alegre',
      state: 'RS',
      zipCode: '90110-120',
      totalValue: 189.5,
      recipient: 'Ricardo Nogueira',
      maxShippingDeadline: daysAgo(5),
      estimatedDeliveryDate: daysAgo(3, 18),
      status: OrderStatus.DELIVERED,
      isDelayed: false,
      trackingEvents: [
        {
          status: 'CREATED',
          description: 'Pedido separado e faturado.',
          eventDate: withTime(deliveredOnTimeBase, 9, 0),
          city: 'Porto Alegre',
          state: 'RS',
        },
        {
          status: 'SHIPPED',
          description: 'Em transito para a cidade do destinatario.',
          eventDate: withTime(daysAgo(5), 11, 40),
          city: 'Porto Alegre',
          state: 'RS',
        },
        {
          status: 'DELIVERED',
          description: 'Entrega concluida dentro do prazo previsto.',
          eventDate: withTime(daysAgo(3), 15, 25),
          city: 'Porto Alegre',
          state: 'RS',
        },
      ],
    },
    {
      orderNumber: 'DEMO-1006',
      invoiceNumber: 'NF-900006',
      trackingCode: 'TRKDEMO1006',
      customerName: 'Patricia Gomes',
      cpf: '678.901.234-54',
      phone: '(62) 3333-1006',
      mobile: '(62) 93333-1006',
      salesChannel: 'Marketplace Premium',
      freightType: 'Transportadora Via Norte',
      freightValue: 46.2,
      shippingDate: deliveredLateBase,
      address: 'Rua do Mercado',
      number: '401',
      neighborhood: 'Setor Bueno',
      city: 'Goiania',
      state: 'GO',
      zipCode: '74215-040',
      totalValue: 649.0,
      recipient: 'Patricia Gomes',
      maxShippingDeadline: daysAgo(9),
      estimatedDeliveryDate: daysAgo(6, 18),
      status: OrderStatus.DELIVERED,
      isDelayed: true,
      trackingEvents: [
        {
          status: 'CREATED',
          description: 'Coleta realizada pela transportadora.',
          eventDate: withTime(deliveredLateBase, 10, 10),
          city: 'Goiania',
          state: 'GO',
        },
        {
          status: 'SHIPPED',
          description: 'Carga em transferencia interestadual.',
          eventDate: withTime(daysAgo(8), 13, 50),
          city: 'Anapolis',
          state: 'GO',
        },
        {
          status: 'DELIVERED',
          description: 'Entrega concluida apos o prazo prometido.',
          eventDate: withTime(daysAgo(4), 17, 35),
          city: 'Goiania',
          state: 'GO',
        },
      ],
    },
    {
      orderNumber: 'DEMO-1007',
      invoiceNumber: 'NF-900007',
      trackingCode: 'TRKDEMO1007',
      customerName: 'Bruno Tavares',
      cpf: '789.012.345-65',
      phone: '(71) 3333-1007',
      mobile: '(71) 92222-1007',
      salesChannel: 'Site Institucional',
      freightType: 'Transportadora Costa Leste',
      freightValue: 37.3,
      shippingDate: failureBase,
      address: 'Travessa do Porto',
      number: '24',
      neighborhood: 'Pituba',
      city: 'Salvador',
      state: 'BA',
      zipCode: '41810-020',
      totalValue: 278.9,
      recipient: 'Bruno Tavares',
      maxShippingDeadline: daysAgo(3),
      estimatedDeliveryDate: daysAgo(1, 18),
      status: OrderStatus.FAILURE,
      isDelayed: true,
      trackingEvents: [
        {
          status: 'SHIPPED',
          description: 'Mercadoria em rota para a base local.',
          eventDate: withTime(failureBase, 9, 45),
          city: 'Salvador',
          state: 'BA',
        },
        {
          status: 'CLARIFY_DELIVERY_FAIL',
          description: 'Falha na entrega por destinatario ausente. Reagendamento necessario.',
          eventDate: withTime(daysAgo(1), 14, 15),
          city: 'Salvador',
          state: 'BA',
        },
      ],
    },
    {
      orderNumber: 'DEMO-1008',
      invoiceNumber: 'NF-900008',
      trackingCode: 'TRKDEMO1008',
      customerName: 'Aline Martins',
      cpf: '890.123.456-76',
      phone: '(81) 3333-1008',
      mobile: '(81) 91111-1008',
      salesChannel: 'Representante Comercial',
      freightType: 'Transportadora Ponte Aerea',
      freightValue: 54.9,
      shippingDate: returnedBase,
      address: 'Rua da Aurora',
      number: '889',
      neighborhood: 'Boa Vista',
      city: 'Recife',
      state: 'PE',
      zipCode: '50050-000',
      totalValue: 719.0,
      recipient: 'Aline Martins',
      maxShippingDeadline: daysAgo(7),
      estimatedDeliveryDate: daysAgo(4, 18),
      status: OrderStatus.RETURNED,
      isDelayed: true,
      trackingEvents: [
        {
          status: 'SHIPPED',
          description: 'Pedido expedido para o destino final.',
          eventDate: withTime(returnedBase, 8, 35),
          city: 'Recife',
          state: 'PE',
        },
        {
          status: 'RETURNED',
          description: 'Volume devolvido ao remetente apos recusado no destino.',
          eventDate: withTime(daysAgo(5), 16, 20),
          city: 'Recife',
          state: 'PE',
        },
      ],
    },
    {
      orderNumber: 'DEMO-1009',
      invoiceNumber: 'NF-900009',
      trackingCode: 'TRKDEMO1009',
      customerName: 'Julio Cesar',
      cpf: '901.234.567-87',
      phone: '(85) 3333-1009',
      mobile: '(85) 90000-1009',
      salesChannel: 'Marketplace Canal',
      freightType: 'Canal Marketplace',
      freightValue: 0,
      shippingDate: channelBase,
      address: 'Rua do Sol',
      number: '62',
      neighborhood: 'Aldeota',
      city: 'Fortaleza',
      state: 'CE',
      zipCode: '60150-160',
      totalValue: 129.9,
      recipient: 'Julio Cesar',
      maxShippingDeadline: daysAgo(2),
      estimatedDeliveryDate: daysFromNow(1),
      status: OrderStatus.CHANNEL_LOGISTICS,
      isDelayed: false,
      trackingEvents: [
        {
          status: 'CHANNEL_LOGISTICS',
          description: 'Logistica gerenciada pelo canal de venda para fins de demonstracao.',
          eventDate: withTime(channelBase, 12, 0),
          city: 'Fortaleza',
          state: 'CE',
        },
      ],
    },
  ];
};

export const ensureDemoCompanyData = async (prisma: PrismaClient) => {
  let company = await prisma.company.findFirst({
    where: {
      name: DEMO_COMPANY_NAME,
    },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: DEMO_COMPANY_NAME,
        cnpj: DEMO_COMPANY_CNPJ,
      },
    });
  } else if (company.cnpj !== DEMO_COMPANY_CNPJ) {
    company = await prisma.company.update({
      where: { id: company.id },
      data: { cnpj: DEMO_COMPANY_CNPJ },
    });
  }

  const demoOrders = buildDemoOrders();

  for (const order of demoOrders) {
    const { trackingEvents, ...orderData } = order;

    const savedOrder = await prisma.order.upsert({
      where: {
        id: `${company.id}:${order.orderNumber}`,
      },
      update: {
        ...orderData,
        companyId: company.id,
        createdById: null,
        lastApiSync: null,
        lastApiError: null,
        apiRawPayload: null,
      },
      create: {
        id: `${company.id}:${order.orderNumber}`,
        ...orderData,
        companyId: company.id,
      },
    });

    await prisma.trackingEvent.deleteMany({
      where: { orderId: savedOrder.id },
    });

    await prisma.trackingEvent.createMany({
      data: trackingEvents.map((event) => ({
        orderId: savedOrder.id,
        status: event.status,
        description: event.description,
        city: event.city || null,
        state: event.state || null,
        eventDate: event.eventDate,
      })),
    });
  }

  return company;
};
