const express = require('express')
const router = express.Router()
const authenticateUser = require('../middleware/auth')
const expiredPlansService = require('../services/expiredPlansService')

// Status do serviço
router.get('/status', authenticateUser, async (req, res) => {
  try {
    const status = expiredPlansService.getStatus()
    res.json({
      success: true,
      data: status
    })
  } catch (error) {
    console.error('Error getting expired plans service status:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao obter status do serviço'
    })
  }
})

// Iniciar serviço
router.post('/start', authenticateUser, async (req, res) => {
  try {
    expiredPlansService.start()
    res.json({
      success: true,
      message: 'Serviço de planos expirados iniciado'
    })
  } catch (error) {
    console.error('Error starting expired plans service:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao iniciar serviço'
    })
  }
})

// Parar serviço
router.post('/stop', authenticateUser, async (req, res) => {
  try {
    expiredPlansService.stop()
    res.json({
      success: true,
      message: 'Serviço de planos expirados parado'
    })
  } catch (error) {
    console.error('Error stopping expired plans service:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao parar serviço'
    })
  }
})

// Verificação manual
router.post('/check', authenticateUser, async (req, res) => {
  try {
    const result = await expiredPlansService.manualCheck()
    res.json({
      success: true,
      message: 'Verificação manual de planos expirados concluída',
      data: result
    })
  } catch (error) {
    console.error('Error in manual expired plans check:', error)
    res.status(500).json({
      success: false,
      message: 'Erro na verificação manual'
    })
  }
})

module.exports = router 