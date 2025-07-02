const express = require('express')
const router = express.Router()
const authenticateUser = require('../middleware/auth')
const autoActivateFreeTrialService = require('../services/autoActivateFreeTrialService')

// Ativar plano gratuito para usuário atual
router.post('/activate', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id

    console.log(`[AutoTrial] Solicitação de ativação para usuário: ${userId}`)

    const result = await autoActivateFreeTrialService.activateFreeTrial(userId)

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data
      })
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        reason: result.reason
      })
    }

  } catch (error) {
    console.error('Error activating free trial:', error)
    res.status(500).json({
      success: false,
      message: 'Erro interno ao ativar plano gratuito'
    })
  }
})

// Verificar elegibilidade do usuário atual
router.get('/eligibility', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    
    const eligibility = await autoActivateFreeTrialService.checkUserEligibility(userId)
    
    res.json({
      success: true,
      data: eligibility
    })

  } catch (error) {
    console.error('Error checking eligibility:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar elegibilidade'
    })
  }
})

// Endpoint para processar novos usuários (webhook ou trigger)
router.post('/process-new-user', async (req, res) => {
  try {
    const { user_id, email } = req.body

    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id é obrigatório'
      })
    }

    console.log(`[AutoTrial] Processando novo usuário: ${user_id} (${email})`)

    const result = await autoActivateFreeTrialService.processNewUser({ id: user_id, email })

    res.json({
      success: true,
      message: 'Novo usuário processado',
      data: result
    })

  } catch (error) {
    console.error('Error processing new user:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao processar novo usuário'
    })
  }
})

module.exports = router 