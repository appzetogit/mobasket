import { formatExportAmount, parseExportAmount } from "../exportFormatUtils"

const toDisplayText = (value, fallback = "N/A") => {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text.length > 0 ? text : fallback
}

const pickFirstValue = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === "string" && value.trim().length === 0) continue
    return value
  }
  return undefined
}

const resolveOrderId = (order = {}) =>
  toDisplayText(order.orderId || order.id || order.subscriptionId, "N/A")

const resolveOrderDateText = (order = {}) => {
  if (order.orderDate && order.orderTime) {
    return `${order.orderDate}, ${order.orderTime}`
  }
  if (order.orderDate) return toDisplayText(order.orderDate, "N/A")
  if (order.date && order.time) return `${order.date}, ${order.time}`
  if (order.date) return toDisplayText(order.date, "N/A")
  if (order.originalOrder?.createdAt) {
    const createdAt = new Date(order.originalOrder.createdAt)
    if (!Number.isNaN(createdAt.getTime())) {
      return createdAt.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    }
  }
  if (order.createdAt) {
    const createdAt = new Date(order.createdAt)
    if (!Number.isNaN(createdAt.getTime())) {
      return createdAt.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    }
  }
  return new Date().toLocaleDateString("en-IN")
}

const normalizeInvoiceItems = (order = {}) => {
  const sourceItems =
    Array.isArray(order.items) && order.items.length > 0
      ? order.items
      : Array.isArray(order.originalOrder?.items)
        ? order.originalOrder.items
        : []

  if (sourceItems.length === 0) {
    return []
  }

  return sourceItems.map((item) => {
    const quantity = Math.max(1, Number(item?.quantity || item?.qty || 1))
    const priceCandidate = pickFirstValue(
      item?.price,
      item?.unitPrice,
      item?.amount,
      item?.itemPrice
    )
    const lineTotalCandidate = pickFirstValue(
      item?.lineTotal,
      item?.total,
      item?.totalPrice,
      item?.amount
    )
    const priceAmount = parseExportAmount(priceCandidate)
    const hasValidPrice = Number.isFinite(priceAmount)
    const parsedLineTotal = parseExportAmount(lineTotalCandidate)
    const totalAmount = Number.isFinite(parsedLineTotal)
      ? parsedLineTotal
      : hasValidPrice
        ? quantity * priceAmount
        : NaN

    return {
      quantity,
      name: toDisplayText(
        item?.name || item?.title || item?.productName || item?.foodName,
        "Unknown Item"
      ),
      unitPrice: hasValidPrice
        ? formatExportAmount(priceAmount, { fallback: "N/A" })
        : "N/A",
      lineTotal: Number.isFinite(totalAmount)
        ? formatExportAmount(totalAmount, { fallback: "N/A" })
        : "N/A",
    }
  })
}

const resolveInvoiceAmount = (order = {}) => {
  const amountCandidate =
    order.totalAmount ??
    order.originalOrder?.totalAmount ??
    order.total ??
    order.originalOrder?.total ??
    order.pricing?.total ??
    order.originalOrder?.pricing?.total ??
    order.amount ??
    order.originalOrder?.amount ??
    null

  return formatExportAmount(amountCandidate, { fallback: "N/A" })
}

const resolveRestaurantText = (order = {}) => {
  const restaurant = pickFirstValue(
    order.restaurant,
    order.restaurantName,
    order.originalOrder?.restaurant,
    order.originalOrder?.restaurantName
  )

  if (restaurant && typeof restaurant === "object") {
    return toDisplayText(
      restaurant.name || restaurant.restaurantName || restaurant.title || restaurant.label,
      "N/A"
    )
  }

  return toDisplayText(restaurant, "N/A")
}

const sanitizeFileNamePart = (value) =>
  toDisplayText(value, "N_A")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60)

export const downloadOrderInvoicePdf = async (order = {}) => {
  const { default: jsPDF } = await import("jspdf")
  const { default: autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  const orderId = resolveOrderId(order)
  const generatedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  doc.setTextColor(17, 24, 39)
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text("Order Invoice", 105, 16, { align: "center" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(75, 85, 99)
  doc.text(`Order ID: ${orderId}`, 14, 24)
  doc.text(`Generated: ${generatedAt}`, 14, 29)

  const infoRows = [
    ["Order Date", resolveOrderDateText(order)],
    [
      "Customer Name",
      toDisplayText(
        pickFirstValue(
          order.customerName,
          order.userName,
          order.originalOrder?.customerName,
          order.originalOrder?.userId?.name
        )
      ),
    ],
    [
      "Customer Phone",
      toDisplayText(
        pickFirstValue(
          order.customerPhone,
          order.userNumber,
          order.originalOrder?.customerPhone,
          order.originalOrder?.userId?.phone
        )
      ),
    ],
    ["Restaurant", resolveRestaurantText(order)],
    [
      "Delivery Type",
      toDisplayText(
        pickFirstValue(order.deliveryType, order.orderType, order.originalOrder?.deliveryType),
        "N/A"
      ),
    ],
  ]

  autoTable(doc, {
    startY: 34,
    head: [["Field", "Details"]],
    body: infoRows,
    theme: "grid",
    styles: {
      fontSize: 10,
      cellPadding: 3,
      textColor: [17, 24, 39],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: "bold" },
      1: { cellWidth: "auto" },
    },
    margin: { left: 14, right: 14 },
  })

  const itemRows = normalizeInvoiceItems(order).map((item) => [
    item.quantity,
    item.name,
    item.unitPrice,
    item.lineTotal,
  ])

  const safeItemRows =
    itemRows.length > 0 ? itemRows : [["-", "No item details available", "N/A", "N/A"]]

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    head: [["Qty", "Item Name", "Unit Price", "Total"]],
    body: safeItemRows,
    theme: "striped",
    styles: {
      fontSize: 10,
      cellPadding: 3,
      textColor: [17, 24, 39],
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [22, 163, 74],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 10,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 16, halign: "center" },
      1: { cellWidth: 86 },
      2: { cellWidth: 37, halign: "right" },
      3: { cellWidth: 37, halign: "right", fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
  })

  const summaryRows = [
    ["Total Amount", resolveInvoiceAmount(order)],
    [
      "Payment Status",
      toDisplayText(
        pickFirstValue(
          order.paymentStatus,
          order.payment?.status,
          order.paymentCollectionStatus,
          order.originalOrder?.paymentStatus,
          order.originalOrder?.payment?.status
        ),
        "N/A"
      ),
    ],
    [
      "Order Status",
      toDisplayText(
        pickFirstValue(order.orderStatus, order.status, order.originalOrder?.orderStatus, order.originalOrder?.status),
        "N/A"
      ),
    ],
  ]

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8,
    body: summaryRows,
    theme: "grid",
    styles: {
      fontSize: 10,
      cellPadding: 3,
      textColor: [17, 24, 39],
      overflow: "linebreak",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: "bold" },
      1: { cellWidth: "auto", halign: "left" },
    },
    margin: { left: 14, right: 14, bottom: 14 },
  })

  const safeOrderId = sanitizeFileNamePart(orderId)
  const filename = `Invoice_${safeOrderId}_${new Date().toISOString().split("T")[0]}.pdf`
  doc.save(filename)
}
