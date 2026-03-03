import { formatExportAmount, normalizeExportCell } from "../exportFormatUtils"

// Export utility functions for reports
export const exportReportsToCSV = (data, headers, filename = "report") => {
  const rows = data.map((item) => {
    return headers.map((header) => {
      const value = item[header.key] || item[header] || ""
      const normalized = typeof value === "object" ? JSON.stringify(value) : value
      return normalizeExportCell(normalized)
    })
  })

  const headerRow = headers.map((h) => (typeof h === "string" ? h : h.label)).join(",")
  const csvContent = [
    headerRow,
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n")

  const BOM = "\uFEFF"
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportReportsToExcel = (data, headers, filename = "report") => {
  const rows = data.map((item) => {
    return headers.map((header) => {
      const value = item[header.key] || item[header] || ""
      const normalized = typeof value === "object" ? JSON.stringify(value) : value
      return normalizeExportCell(normalized)
    })
  })

  const headerRow = headers.map((h) => (typeof h === "string" ? h : h.label)).join("\t")
  const csvContent = [
    headerRow,
    ...rows.map((row) => row.join("\t")),
  ].join("\n")

  const blob = new Blob([csvContent], { type: "application/vnd.ms-excel" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportReportsToPDF = (data, headers, filename = "report", title = "Report") => {
  const headerRow = headers.map((h) => (typeof h === "string" ? h : h.label))

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${filename}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10px; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        h1 { text-align: center; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p>Generated on: ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            ${headerRow.map((h) => `<th>${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${data
            .map((item) => {
              const cells = headers.map((header) => {
                const value = item[header.key] || item[header] || ""
                return `<td>${String(normalizeExportCell(value))}</td>`
              })
              return `<tr>${cells.join("")}</tr>`
            })
            .join("")}
        </tbody>
      </table>
    </body>
    </html>
  `

  const printWindow = window.open("", "_blank")
  printWindow.document.write(htmlContent)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 250)
}

export const exportReportsToJSON = (data, filename = "report") => {
  const jsonContent = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonContent], { type: "application/json" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.json`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Specific export functions for Transaction Report
export const exportTransactionReportToCSV = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Item Discount", "Coupon Discount", "Referral Discount", "Discounted Amount", "VAT/Tax", "Delivery Charge", "Order Amount"]
  const rows = transactions.map((transaction, index) => [
    index + 1,
    transaction.orderId,
    transaction.restaurant,
    transaction.customerName,
    formatExportAmount(transaction.totalItemAmount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.itemDiscount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.couponDiscount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.referralDiscount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.discountedAmount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.vatTax, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.deliveryCharge, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.orderAmount, { fallback: "INR 0.00" }),
  ])

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n")

  const BOM = "\uFEFF"
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.csv`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportTransactionReportToExcel = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Item Discount", "Coupon Discount", "Referral Discount", "Discounted Amount", "VAT/Tax", "Delivery Charge", "Order Amount"]
  const rows = transactions.map((transaction, index) => [
    index + 1,
    transaction.orderId,
    transaction.restaurant,
    transaction.customerName,
    formatExportAmount(transaction.totalItemAmount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.itemDiscount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.couponDiscount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.referralDiscount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.discountedAmount, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.vatTax, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.deliveryCharge, { fallback: "INR 0.00" }),
    formatExportAmount(transaction.orderAmount, { fallback: "INR 0.00" }),
  ])

  const csvContent = [
    headers.join("\t"),
    ...rows.map((row) => row.join("\t")),
  ].join("\n")

  const blob = new Blob([csvContent], { type: "application/vnd.ms-excel" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.xls`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const exportTransactionReportToPDF = (transactions, filename = "transaction_report") => {
  const headers = ["SI", "Order ID", "Restaurant", "Customer Name", "Total Item Amount", "Item Discount", "Coupon Discount", "Referral Discount", "Discounted Amount", "VAT/Tax", "Delivery Charge", "Order Amount"]

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${filename}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 8px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background-color: #f2f2f2; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        h1 { text-align: center; }
      </style>
    </head>
    <body>
      <h1>Transaction Report</h1>
      <p>Generated on: ${new Date().toLocaleString()}</p>
      <table>
        <thead>
          <tr>
            ${headers.map((h) => `<th>${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${transactions
            .map(
              (transaction, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${transaction.orderId}</td>
              <td>${transaction.restaurant}</td>
              <td>${transaction.customerName}</td>
              <td>${formatExportAmount(transaction.totalItemAmount, { fallback: "INR 0.00" })}</td>
              <td>${formatExportAmount(transaction.itemDiscount, { fallback: "INR 0.00" })}</td>
              <td>${formatExportAmount(transaction.couponDiscount, { fallback: "INR 0.00" })}</td>
              <td>${formatExportAmount(transaction.referralDiscount, { fallback: "INR 0.00" })}</td>
              <td>${formatExportAmount(transaction.discountedAmount, { fallback: "INR 0.00" })}</td>
              <td>${formatExportAmount(transaction.vatTax, { fallback: "INR 0.00" })}</td>
              <td>${formatExportAmount(transaction.deliveryCharge, { fallback: "INR 0.00" })}</td>
              <td>${formatExportAmount(transaction.orderAmount, { fallback: "INR 0.00" })}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    </body>
    </html>
  `

  const printWindow = window.open("", "_blank")
  printWindow.document.write(htmlContent)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 250)
}

export const exportTransactionReportToJSON = (transactions, filename = "transaction_report") => {
  const jsonContent = JSON.stringify(transactions, null, 2)
  const blob = new Blob([jsonContent], { type: "application/json" })
  const link = document.createElement("a")
  const url = URL.createObjectURL(blob)
  link.setAttribute("href", url)
  link.setAttribute("download", `${filename}_${new Date().toISOString().split("T")[0]}.json`)
  link.style.visibility = "hidden"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
